#!/usr/bin/env bash
# Run a command as one specific GitHub login, fenced against concurrent
# `gh auth switch`: the token is resolved per process, its identity is
# verified, and both gh (GH_TOKEN) and git push (credential helper) use it.
#
# Usage: bash as.sh <login> <command> [args...]
#   bash as.sh KintsugiBot gh pr create ...
#   bash as.sh KintsugiBot git push -u origin HEAD
#   bash as.sh KintsugiBot bash pr-snapshot.sh 12
# Exit 3: no credential for <login>, or the token resolves to someone else.
# Inside, git cannot use SSH or prompt; HTTPS credentials go to github.com only.
set -euo pipefail

login=${1:?usage: as.sh <login> <command> [args...]}
shift
[ $# -gt 0 ] || { echo "as.sh: no command given" >&2; exit 2; }

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

# Command-scoped git config: drop inherited credential helpers, then answer
# with GH_TOKEN - for https://github.com only, never another host. Never
# written to any config file.
export GIT_CONFIG_COUNT=2
export GIT_CONFIG_KEY_0=credential.helper GIT_CONFIG_VALUE_0=
export GIT_CONFIG_KEY_1=credential.helper
export GIT_CONFIG_VALUE_1='!f() { [ "$1" = get ] || exit 0; h= p=; while IFS= read -r l && [ -n "$l" ]; do case $l in host=*) h=${l#host=} ;; protocol=*) p=${l#protocol=} ;; esac; done; [ "$h" = github.com ] && [ "$p" = https ] || exit 0; echo username=x-access-token; echo "password=$GH_TOKEN"; }; f'

exec "$@"
