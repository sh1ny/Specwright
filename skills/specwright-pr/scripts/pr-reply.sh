#!/usr/bin/env bash
# Reply to one piece of PR feedback, then (optionally) resolve its thread.
# Every reply carries a hidden `specwright:handled <source-id>` marker (plus
# `resolve` when the thread is to be resolved), so pr-snapshot.sh stops listing
# that item and can spot a resolution that failed - dedup state lives on GitHub.
#
# Usage:
#   bash pr-reply.sh <PR> thread  <thread-id> <root-comment-id> <body-file> [--resolve] [--repo o/n]
#   bash pr-reply.sh <PR> comment <source-id> <body-file> [--repo o/n]
#   bash pr-reply.sh <PR> resolve <thread-id> [--repo o/n]   (retry a failed resolution only)
# Thread replies use REST (GraphQL replies can attach to a pending review and
# stay invisible). Exit 2: a pending review of yours exists - submit or
# discard it on GitHub first. Wrap with as.sh to pin the GitHub identity.
set -euo pipefail

pr=${1:?PR}; kind=${2:?thread|comment|resolve}; shift 2
repo= resolve=0 args=()
while [ $# -gt 0 ]; do
  case $1 in
    --repo) repo=${2:?--repo needs owner/name}; shift 2 ;;
    --resolve) resolve=1; shift ;;
    *) args+=("$1"); shift ;;
  esac
done
[ -n "$repo" ] || repo=$(gh repo view --json owner,name --jq '.owner.login + "/" + .name')
owner=${repo%%/*} name=${repo#*/}

pending_check() {
  n=$(gh api graphql -f owner="$owner" -f name="$name" -F pr="$pr" -f query='
    query($owner:String!,$name:String!,$pr:Int!){ viewer{login}
      repository(owner:$owner,name:$name){ pullRequest(number:$pr){
        reviews(states:PENDING, first:10){ nodes{ author{login} } } } } }' \
    --jq '.data.viewer.login as $me | [.data.repository.pullRequest.reviews.nodes[] | select(.author.login == $me)] | length')
  if [ "$n" != 0 ]; then
    echo "pr-reply: you have a pending (unsubmitted) review on #$pr; replies may be hidden in it. Submit or discard it first." >&2
    exit 2
  fi
}

body_with_marker() {  # <body-file> <marker> -> temp file path
  tmp=$(mktemp)
  cat "$1" > "$tmp"
  printf '\n\n<!-- specwright:handled %s -->\n' "$2" >> "$tmp"
  printf '%s' "$tmp"
}

resolve_thread() {  # <thread-id>
  gh api graphql -f threadId="$1" -f query='
    mutation($threadId:ID!){ resolveReviewThread(input:{threadId:$threadId}){ thread{ id isResolved } } }' \
    --jq '"resolved: " + (.data.resolveReviewThread.thread.isResolved | tostring)'
}

pending_check
case $kind in
  thread)
    [ ${#args[@]} -eq 3 ] || { echo "usage: pr-reply.sh <PR> thread <thread-id> <root-comment-id> <body-file> [--resolve]" >&2; exit 2; }
    thread=${args[0]} root=${args[1]}
    marker=$thread; [ "$resolve" = 1 ] && marker="$thread resolve"
    file=$(body_with_marker "${args[2]}" "$marker")
    gh api --method POST "repos/$owner/$name/pulls/$pr/comments/$root/replies" -F body=@"$file" --jq '.html_url'
    rm -f "$file"
    pending_check
    if [ "$resolve" = 1 ]; then
      resolve_thread "$thread" || {
        echo "pr-reply: reply posted but resolution failed; retry only the resolution: pr-reply.sh $pr resolve $thread" >&2
        exit 1
      }
    fi
    ;;
  comment)
    [ ${#args[@]} -eq 2 ] || { echo "usage: pr-reply.sh <PR> comment <source-id> <body-file>" >&2; exit 2; }
    file=$(body_with_marker "${args[1]}" "${args[0]}")
    gh pr comment "$pr" -R "$repo" --body-file "$file"
    rm -f "$file"
    ;;
  resolve)
    [ ${#args[@]} -eq 1 ] || { echo "usage: pr-reply.sh <PR> resolve <thread-id>" >&2; exit 2; }
    resolve_thread "${args[0]}"
    ;;
  *) echo "pr-reply: kind must be thread, comment or resolve" >&2; exit 2 ;;
esac
