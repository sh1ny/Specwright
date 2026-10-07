#!/usr/bin/env bash
# One-call PR snapshot: state, checks, unresolved threads, unhandled comments
# and reviews, as one JSON line. Needs only gh (uses gh's built-in --jq).
#
# Usage: bash pr-snapshot.sh [PR-number|PR-url] [--repo owner/name] [--logs]
#                            [--wait [--timeout SECONDS] [--interval SECONDS]]
#   (no PR)   the PR for the current branch
#   --logs    append the last 80 lines of each failing run's failed-step log
#   --wait    poll inside this process; print {"wake":..., "snapshot":...}
#             once anything changes (checks, threads, comments, reviews, head,
#             state) or the timeout passes (default 1800s, interval 60s)
# Wrap with as.sh to pin the GitHub identity.
set -euo pipefail

pr= repo= logs=0 wait=0 timeout=1800 interval=60
while [ $# -gt 0 ]; do
  case $1 in
    --repo) repo=$2; shift 2 ;;
    --logs) logs=1; shift ;;
    --wait) wait=1; shift ;;
    --timeout) timeout=$2; shift 2 ;;
    --interval) interval=$2; shift 2 ;;
    https://*/pull/*)
      repo=$(printf '%s' "$1" | sed -E 's#https://[^/]+/([^/]+/[^/]+)/pull/.*#\1#')
      pr=$(printf '%s' "$1" | sed -E 's#.*/pull/([0-9]+).*#\1#'); shift ;;
    [0-9]*) pr=$1; shift ;;
    *) echo "pr-snapshot: unknown argument '$1'" >&2; exit 2 ;;
  esac
done
[ -n "$repo" ] || repo=$(gh repo view --json owner,name --jq '.owner.login + "/" + .name')
[ -n "$pr" ] || pr=$(gh pr view --json number --jq .number)
owner=${repo%%/*} name=${repo#*/}

read -r -d '' QUERY <<'GQL' || true
query($owner:String!, $name:String!, $pr:Int!) {
  viewer { login }
  repository(owner:$owner, name:$name) { pullRequest(number:$pr) {
    number url state isDraft mergeable mergeStateStatus reviewDecision
    headRefName headRefOid baseRefName author { login }
    commits(last:1) { nodes { commit { statusCheckRollup { state contexts(first:100) { nodes {
      __typename
      ... on CheckRun { name status conclusion detailsUrl checkSuite { workflowRun { databaseId } } }
      ... on StatusContext { context state targetUrl }
    } } } } } }
    reviewThreads(first:100) { pageInfo { hasNextPage } nodes {
      id isResolved isOutdated path line originalLine
      comments(first:50) { nodes { databaseId author { login } body createdAt url } }
    } }
    comments(last:50) { nodes { id author { login } body createdAt url } }
    reviews(last:50) { nodes { id author { login } body state submittedAt } }
  } }
}
GQL

read -r -d '' SHAPE <<'JQ' || true
def clip($n): (. // "") | gsub("(?s)<!--.*?-->"; "") | gsub("\n{3,}"; "\n\n")
  | if length > $n then .[0:$n] + " …[truncated, see url]" else . end;
.data.viewer.login as $me
| .data.repository.pullRequest as $p
| ([ ($p.comments.nodes[]), ($p.reviews.nodes[]), ($p.reviewThreads.nodes[].comments.nodes[]) ]
   | map(select((.author.login // "") == $me) | (.body // "") | [scan("specwright:handled ([A-Za-z0-9_=-]+)") | .[0]])
   | add // []) as $handled
| ([ $p.commits.nodes[0].commit.statusCheckRollup.contexts.nodes[]? |
     if .__typename == "CheckRun" then
       { name, url: .detailsUrl, run_id: .checkSuite.workflowRun.databaseId,
         state: (if .status != "COMPLETED" then "pending"
                 elif (.conclusion | IN("SUCCESS","NEUTRAL","SKIPPED")) then "pass" else "fail" end) }
     else
       { name: .context, url: .targetUrl, run_id: null,
         state: (if .state == "SUCCESS" then "pass"
                 elif (.state | IN("PENDING","EXPECTED")) then "pending" else "fail" end) }
     end ]) as $checks
| ([ $p.reviewThreads.nodes[] | select(.isResolved | not) |
     { id, root_id: .comments.nodes[0].databaseId, path, line: (.line // .originalLine),
       outdated: .isOutdated,
       awaiting_reviewer: ((.comments.nodes[-1].author.login // "") == $me),
       comments: [ .comments.nodes[] | { author: (.author.login // "ghost"), body: (.body | clip(2500)), at: .createdAt, url } ] } ]) as $threads
| ([ $p.comments.nodes[] | select((.author.login // "") != $me and ((.id | IN($handled[])) | not)) |
     { id, author: (.author.login // "ghost"), body: (.body | clip(1200)), at: .createdAt, url } ]) as $comments
| ([ $p.reviews.nodes[] | select(.state != "PENDING" and (.body // "") != ""
       and (.author.login // "") != $me and ((.id | IN($handled[])) | not)) |
     { id, author: (.author.login // "ghost"), state, body: (.body | clip(1200)), at: .submittedAt } ]) as $reviews
| {
    viewer: $me, number: $p.number, url: $p.url, state: $p.state, draft: $p.isDraft,
    mergeable: $p.mergeable, merge_state: $p.mergeStateStatus, review_decision: $p.reviewDecision,
    head: $p.headRefName, head_oid: $p.headRefOid, base: $p.baseRefName, author: $p.author.login,
    pending_review: ([ $p.reviews.nodes[] | select(.state == "PENDING" and (.author.login // "") == $me) ] | length > 0),
    checks: { total: ($checks | length),
              pending: ([ $checks[] | select(.state == "pending") ] | length),
              failing: [ $checks[] | select(.state == "fail") ] },
    fail_run_ids: ([ $checks[] | select(.state == "fail" and .run_id != null) | .run_id ] | unique),
    threads: $threads, threads_truncated: $p.reviewThreads.pageInfo.hasNextPage,
    comments: $comments, reviews: $reviews,
    sig: ([ $p.state, $p.headRefOid, $p.mergeStateStatus,
            ($checks | map(.name + "=" + .state) | sort | join(",")),
            ($threads | map(.id + ":" + (.comments | length | tostring)) | join(",")),
            ($comments | map(.id) | join(",")), ($reviews | map(.id) | join(",")) ] | join("|"))
  }
| tojson
JQ

snapshot() {
  gh api graphql -f query="$QUERY" -f owner="$owner" -f name="$name" -F pr="$pr" --jq "$SHAPE"
}
sig_of() { printf '%s' "$1" | grep -o '"sig":"[^"]*"' || true; }

if [ "$wait" = 1 ]; then
  base=$(snapshot); base_sig=$(sig_of "$base"); waited=0; wake=timeout; snap=$base
  while [ "$waited" -lt "$timeout" ]; do
    sleep "$interval"; waited=$((waited + interval))
    snap=$(snapshot) || continue
    if [ "$(sig_of "$snap")" != "$base_sig" ]; then wake=changed; break; fi
  done
  printf '{"wake":"%s","waited":%s,"snapshot":%s}\n' "$wake" "$waited" "$snap"
else
  snap=$(snapshot)
  printf '%s\n' "$snap"
fi

if [ "$logs" = 1 ]; then
  ids=$(printf '%s' "$snap" | grep -o '"fail_run_ids":\[[0-9,]*\]' | grep -o '[0-9][0-9]*' || true)
  for id in $ids; do
    printf '\n===== failed log: run %s =====\n' "$id"
    gh run view "$id" -R "$repo" --log-failed 2>&1 | tail -n 80 || true
  done
fi
