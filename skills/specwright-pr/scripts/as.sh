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

# Command-scoped git config: drop inherited credential helpers, then answer
# with GH_TOKEN. Never written to any config file.
export GIT_CONFIG_COUNT=2
export GIT_CONFIG_KEY_0=credential.helper GIT_CONFIG_VALUE_0=
export GIT_CONFIG_KEY_1=credential.helper
export GIT_CONFIG_VALUE_1='!f() { echo username=x-access-token; echo "password=$GH_TOKEN"; }; f'

exec "$@"
