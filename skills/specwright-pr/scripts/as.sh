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

# git push: the token fences HTTPS only. Over SSH the key SSH picks decides the
# account, so refuse rather than push as an unverified identity. The remote
# must be named: a bare push goes wherever pushRemote/pushDefault/upstream
# config says, which this check cannot see.
if [ "$1" = git ]; then
  # Find the subcommand past git's global options (-C dir, -c k=v, ...), and
  # keep those options so the URL lookup sees the same repo and config.
  pre=() sub= rest=()
  set -- "${@:2}"
  while [ $# -gt 0 ]; do
    case $1 in
      -C|-c|--git-dir|--work-tree|--namespace|--config-env) pre+=("$1" "${2:-}"); shift 2 || shift ;;
      -*) pre+=("$1"); shift ;;
      *) sub=$1; shift; rest=("$@"); break ;;
    esac
  done
  set -- git "${pre[@]}" ${sub:+"$sub"} "${rest[@]}"
fi
if [ "${sub:-}" = push ]; then
  remote=
  while [ ${#rest[@]} -gt 0 ]; do
    a=${rest[0]}; rest=("${rest[@]:1}")
    case $a in
      --repo=*) remote=${a#--repo=}; break ;;
      --repo) remote=${rest[0]:-}; break ;;
      -o|--push-option|--receive-pack|--exec) rest=("${rest[@]:1}") ;;
      -*) ;;
      *) remote=$a; break ;;
    esac
  done
  [ -n "$remote" ] || { echo "as.sh: name the remote (git push <remote> ...); a bare push may go elsewhere" >&2; exit 3; }
  url=$(git "${pre[@]}" remote get-url --push "$remote" 2>/dev/null) || url=
  case $url in
    https://github.com/*) ;;
    *) echo "as.sh: push URL of '$remote' is '$url', not https://github.com/...; cannot pin the identity" >&2; exit 3 ;;
  esac
fi

# Command-scoped git config: drop inherited credential helpers, then answer
# with GH_TOKEN - for https://github.com only, never another host. Never
# written to any config file.
export GIT_CONFIG_COUNT=2
export GIT_CONFIG_KEY_0=credential.helper GIT_CONFIG_VALUE_0=
export GIT_CONFIG_KEY_1=credential.helper
export GIT_CONFIG_VALUE_1='!f() { [ "$1" = get ] || exit 0; h= p=; while IFS= read -r l && [ -n "$l" ]; do case $l in host=*) h=${l#host=} ;; protocol=*) p=${l#protocol=} ;; esac; done; [ "$h" = github.com ] && [ "$p" = https ] || exit 0; echo username=x-access-token; echo "password=$GH_TOKEN"; }; f'

exec "$@"
