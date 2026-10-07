#!/usr/bin/env bash
# Run a command as one specific GitHub login, fenced against concurrent
# `gh auth switch`: the token is resolved per process, its identity is
# verified, and both gh (GH_TOKEN) and git push (credential helper) use it.
#
# Usage: bash as.sh <login> <command> [args...]
#   bash as.sh KintsugiBot gh pr create ...
#   bash as.sh KintsugiBot git push -u origin HEAD
#   bash as.sh KintsugiBot bash pr-snapshot.sh 12
# Exit 3: no credential for <login>, the token resolves to someone else, or gh
# is older than 2.40 (no per-account token lookup).
# Inside, git cannot use SSH or prompt; HTTPS credentials go to github.com only.
# Run git from inside the target repo: inherited http extraHeaders are scrubbed
# for the current repository only, not one selected with git -C/--git-dir.
set -euo pipefail

login=${1:?usage: as.sh <login> <command> [args...]}
shift
[ $# -gt 0 ] || { echo "as.sh: no command given" >&2; exit 2; }

# Without `gh auth token --user` the only per-account lookup is a shared
# `gh auth switch`, which other agents race on - so refuse rather than fall back.
case $(gh auth token --help 2>&1 || true) in
  *--user*) ;;
  *) echo "as.sh: $(gh --version 2>/dev/null | head -n 1 || echo 'gh not found') cannot look up a token per account (gh auth token --user, gh 2.40+); upgrade gh" >&2; exit 3 ;;
esac

unset GH_TOKEN GITHUB_TOKEN
token=$(gh auth token --hostname github.com --user "$login" 2>/dev/null) || token=
[ -n "$token" ] || { echo "as.sh: no gh credential for '$login' (gh auth login)" >&2; exit 3; }
export GH_TOKEN=$token

actual=$(gh api --hostname github.com user --jq .login 2>/dev/null) || actual=
[ "$actual" = "$login" ] || { echo "as.sh: token resolves to '$actual', expected '$login'; refusing" >&2; exit 3; }

# git: the identity is enforced at the transport, not by reading the command
# line. SSH would authenticate with whatever key SSH picks, so it is disabled
# (GIT_SSH_COMMAND overrides core.sshCommand, even one passed with -c); HTTPS
# gets the pinned token for github.com only; nothing may prompt. Whatever
# remote, push URLs or options a git command uses, it can authenticate as
# <login> or not at all.
export GIT_SSH_COMMAND='sh -c "echo as.sh: SSH is disabled - push over https://github.com so the identity can be pinned >&2; exit 1"'
export GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never GIT_ASKPASS= SSH_ASKPASS=

# Command-scoped git config, never written to any config file. First empty
# every inherited http extraHeader: an Authorization header there would
# authenticate the push as someone else. An empty value resets only its own
# key - a URL-scoped header outranks a plain reset - so each key in effect
# here is reset by name. Then drop inherited credential helpers and answer
# with GH_TOKEN - for https://github.com only, never another host.
n=0
cfg() { export "GIT_CONFIG_KEY_$n=$1" "GIT_CONFIG_VALUE_$n=$2"; n=$((n + 1)); }
cfg http.extraHeader ''
while IFS= read -r key; do cfg "$key" ''; done \
  < <(git config --name-only --get-regexp '^http\..+\.extraheader$' 2>/dev/null | sort -u || true)
cfg credential.helper ''
cfg credential.helper '!f() { [ "$1" = get ] || exit 0; h= p=; while IFS= read -r l && [ -n "$l" ]; do case $l in host=*) h=${l#host=} ;; protocol=*) p=${l#protocol=} ;; esac; done; [ "$h" = github.com ] && [ "$p" = https ] || exit 0; echo username=x-access-token; echo "password=$GH_TOKEN"; }; f'
export GIT_CONFIG_COUNT=$n

exec "$@"
