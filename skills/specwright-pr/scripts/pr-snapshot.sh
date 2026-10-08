#!/usr/bin/env bash
# One-call PR snapshot: state, checks, unresolved threads, unhandled comments
# and reviews, as one JSON line. Needs only gh (uses gh's built-in --jq).
#
# Usage: bash pr-snapshot.sh [PR-number|PR-url] [--repo owner/name] [--logs]
#                            [--reviewer LOGIN:ROLE:SECONDS]...
#                            [--wait [--timeout SECONDS] [--interval SECONDS]]
#   (no PR)   the PR for the current branch
#   --reviewer  report whether LOGIN (required|advisory, timeout in seconds)
#             has reported on the current head: "reviewers" in the output
#   --logs    append the last 80 lines of each failing run's failed-step log
#   --wait    poll inside this process; print {"wake":..., "snapshot":...}
#             once anything changes (checks, threads, comments, reviews, head,
#             state, edits, a list getting cut off) or the timeout passes
#             (default 1800s, interval 60s); "incomplete" at once if the first
#             snapshot is already cut off; exits 1 if the last poll failed
# "complete": false means a list was cut off at its page size - do not treat
# missing items as absent.
# Wrap with as.sh to pin the GitHub identity.
set -euo pipefail

pr= repo= logs=0 wait=0 timeout=1800 interval=60 reviewers=
while [ $# -gt 0 ]; do
  case $1 in
    --repo) repo=${2:?--repo needs owner/name}; shift 2 ;;
    --reviewer)
      r=${2:?--reviewer needs LOGIN:ROLE:SECONDS}; r=${r/\[bot\]:/:}
      printf '%s' "$r" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9-]*:(required|advisory):[0-9]+$' \
        || { echo "pr-snapshot: bad --reviewer '$2' (want LOGIN:required|advisory:SECONDS)" >&2; exit 2; }
      IFS=: read -r rl rr rt <<<"$r"
      reviewers="$reviewers${reviewers:+,}{\"login\":\"$rl\",\"role\":\"$rr\",\"timeout\":$rt}"; shift 2 ;;
    --logs) logs=1; shift ;;
    --wait) wait=1; shift ;;
    --timeout) timeout=${2:?--timeout needs seconds}; shift 2 ;;
    --interval) interval=${2:?--interval needs seconds}; shift 2 ;;
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
    commits(last:1) { nodes { commit { statusCheckRollup { state contexts(first:100) { pageInfo { hasNextPage } nodes {
      __typename
      ... on CheckRun { name status conclusion detailsUrl checkSuite { app { slug } workflowRun { databaseId } } }
      ... on StatusContext { context state targetUrl }
    } } } } } }
    reviewThreads(first:100) { pageInfo { hasNextPage } nodes {
      id isResolved isOutdated path line originalLine
      comments(first:100) { totalCount nodes { id databaseId author { login } body createdAt lastEditedAt url
                                               up: reactions(content:THUMBS_UP, last:20) { nodes { createdAt user { login } } } down: reactions(content:THUMBS_DOWN, last:20) { nodes { createdAt user { login } } } } }
    } }
    comments(last:100) { pageInfo { hasPreviousPage } nodes { id author { login } body createdAt lastEditedAt url
                                                              up: reactions(content:THUMBS_UP, last:20) { nodes { createdAt user { login } } } down: reactions(content:THUMBS_DOWN, last:20) { nodes { createdAt user { login } } } } }
    reviews(last:100) { pageInfo { hasPreviousPage } nodes { id author { login } body state submittedAt lastEditedAt url
                                                             up: reactions(content:THUMBS_UP, last:20) { nodes { createdAt user { login } } } down: reactions(content:THUMBS_DOWN, last:20) { nodes { createdAt user { login } } } } }
  } }
}
GQL

read -r -d '' SHAPE <<'JQ' || true
def clip($n): (. // "") | gsub("(?s)<!--.*?-->"; "") | gsub("\n{3,}"; "\n\n")
  | if length > $n then .[0:$n] + " …[truncated, see url]" else . end;
# Unhandled: no reply of yours marks it handled, or it was edited after that reply.
def unhandled($h): (.lastEditedAt // .createdAt // .submittedAt // "") as $rev
  | ($h[.id] == null) or ($rev > $h[.id]);
# A 👍/👎 of yours answers an item too (the reaction-only answer to a
# reviewer's follow-up), but only until the item is edited after it. Other
# reactions (👀 and the like) answer nothing.
def reacted($me): ([ (.up.nodes[]?, .down.nodes[]?) | select((.user.login // "") == $me) | .createdAt ] | max // "")
  as $t | $t != "" and $t >= (.lastEditedAt // .createdAt // .submittedAt // "");
def norm: sub("\\[bot\\]$"; "");
.data.viewer.login as $me
| .data.repository.pullRequest as $p
# $handled: source id -> time of your latest reply carrying its marker. An item
# edited after that reply counts as unhandled again.
| ([ ($p.comments.nodes[]), ($p.reviews.nodes[]), ($p.reviewThreads.nodes[].comments.nodes[]) ]
   | map(select((.author.login // "") == $me) | (.createdAt // .submittedAt // "") as $t
         | (.body // "") | [scan("specwright:handled ([A-Za-z0-9_=-]+)") | {(.[0]): $t}] | add // {})
   | reduce .[] as $m ({}; reduce ($m | to_entries[]) as $e (.; .[$e.key] = ([.[$e.key] // "", $e.value] | max))))
  as $handled
| ([ $p.commits.nodes[0].commit.statusCheckRollup.contexts.nodes[]? |
     if .__typename == "CheckRun" then
       { name, url: .detailsUrl, run_id: .checkSuite.workflowRun.databaseId, app: .checkSuite.app.slug,
         state: (if .status != "COMPLETED" then "pending"
                 elif (.conclusion | IN("SUCCESS","NEUTRAL","SKIPPED")) then "pass" else "fail" end) }
     else
       { name: .context, url: .targetUrl, run_id: null, app: null,
         state: (if .state == "SUCCESS" then "pass"
                 elif (.state | IN("PENDING","EXPECTED")) then "pending" else "fail" end) }
     end ]) as $checks
# A thread's rev covers every comment, so an edit anywhere in it counts. A
# reviewer may answer by editing an earlier comment instead of replying:
# $edited marks a comment of theirs edited after your latest reply. $open: the
# reviewer comments that came (or were edited) after your latest reply and
# carry no reaction of yours - unanswered. Resolved threads are listed too
# when $open is non-empty: bots often reply after the thread was resolved.
| ([ $p.reviewThreads.nodes[] |
     .id as $tid | .comments.nodes[-1] as $last |
     ([ .comments.nodes[] | select((.author.login // "") == $me) | .createdAt ] | max // "") as $replied |
     ([ .comments.nodes[] | select((.author.login // "") != $me and (.lastEditedAt // "") > $replied) ] | length > 0) as $edited |
     ([ .comments.nodes[] | select((.author.login // "") != $me
          and (.lastEditedAt // .createdAt // "") > $replied and (reacted($me) | not)) ]) as $open |
     select((.isResolved | not) or ($open | length > 0)) |
     { id, root_id: .comments.nodes[0].databaseId, path, line: (.line // .originalLine),
       outdated: .isOutdated, resolved: .isResolved,
       rev: (($last.databaseId // 0 | tostring) + "@"
             + ([ .comments.nodes[] | .lastEditedAt // .createdAt // "" ] | max // "")),
       awaiting_reviewer: ($replied != "" and ($open | length == 0)),
       resolve_pending: ((.isResolved | not) and (($last.author.login // "") == $me) and ($edited | not)
         and (($last.body // "") | contains("specwright:handled " + $tid + " resolve"))),
       comments: [ .comments.nodes[] | { id, author: (.author.login // "ghost"), body: (.body | clip(2500)),
                                        at: .createdAt, edited: .lastEditedAt, url, reacted: reacted($me) } ] } ]) as $threads
| ([ $p.comments.nodes[] | select((.author.login // "") != $me and unhandled($handled) and (reacted($me) | not)) |
     { id, rev: (.lastEditedAt // .createdAt), author: (.author.login // "ghost"),
       body: (.body | clip(1200)), at: .createdAt, url } ]) as $comments
| ([ $p.reviews.nodes[] | select(.state != "PENDING" and (.body // "") != ""
       and (.author.login // "") != $me and unhandled($handled) and (reacted($me) | not)) |
     { id, rev: (.lastEditedAt // .submittedAt), author: (.author.login // "ghost"), state,
       body: (.body | clip(1200)), at: .submittedAt, url } ]) as $reviews
# A reviewer's latest verdict stays CHANGES_REQUESTED until they approve or it
# is dismissed. Stale: none of the threads they started is still open.
| ([ $p.reviews.nodes[] | select(.state | IN("APPROVED","CHANGES_REQUESTED","DISMISSED")) ]
   | group_by(.author.login // "ghost") | map(max_by(.submittedAt // ""))
   | map(select(.state == "CHANGES_REQUESTED") | (.author.login // "ghost") as $a
         | select([ $threads[] | select((.resolved | not) and .comments[0].author == $a) ] | length == 0)
         | { author: $a, review_id: .id, at: .submittedAt })) as $stale_verdicts
# Has each configured reviewer reported on the current head? cfg (prepended by
# the script) gives the reviewers, the head's push time and GitHub's "now".
# Bots that are known get a precise signal; any other login counts as reported
# once it posts anything (or completes a check) at or after the push.
| (if cfg.head == $p.headRefOid then cfg.pushed else null end) as $pushed
| $p.headRefOid as $head
| ([ ($p.comments.nodes[]), ($p.reviews.nodes[]), ($p.reviewThreads.nodes[].comments.nodes[]) ]) as $all
| ([ cfg.reviewers[] | . as $r
     | [ $all[] | select((.author.login // "" | norm) == $r.login) ] as $by
     | (if $r.login == "chatgpt-codex-connector" then
          # every result, findings or not, says "**Reviewed commit:** `<sha>`"
          [ $by[] | (.body // "") | scan("Reviewed commit:\\*\\* `([0-9a-f]{7,40})`") | .[0]
            | select(. as $s | $head | startswith($s)) ] | length > 0
        elif $r.login == "kody-ai" then
          # its check run is created on the commit it reviews
          [ $checks[] | select(.name == "Kody Code Review" and .state != "pending") ] | length > 0
        elif $pushed == null then false
        elif $r.login == "kintsugimira" then
          # one walkthrough comment, edited in place; no SHA anywhere
          ([ $by[] | select(((.body // "") | contains("<!-- mira-walkthrough -->"))
               and (.lastEditedAt // .createdAt // "") >= $pushed
               and ((.body // "") | test("Reviewing this PR|Code review in progress") | not)) ] | length > 0)
          or ([ $by[] | select(.state != null and (.submittedAt // "") >= $pushed) ] | length > 0)
        else
          ([ $by[] | select((.lastEditedAt // .createdAt // .submittedAt // "") >= $pushed) ] | length > 0)
          or ([ $checks[] | select(((.app // "") | norm) == $r.login and .state != "pending") ] | length > 0)
        end) as $done
     | { login: $r.login, role: $r.role, timeout: $r.timeout,
         state: (if $done then "reported"
                 elif $pushed != null and (cfg.now - ($pushed | fromdateiso8601)) >= $r.timeout then "timed_out"
                 else "waiting" end) } ]) as $reviewers
# A pending check of an advisory reviewer stops blocking once that reviewer
# reported or timed out.
| ([ $reviewers[] | select(.role == "advisory" and .state != "waiting") | .login ]) as $quiet
| ([ $checks[] | select(.state == "pending" and (((.app // "") | norm) as $a | any($quiet[]; . == $a))) ]
   | length) as $quiet_pending
| ([ (if $p.reviewThreads.pageInfo.hasNextPage then "threads" else empty end),
     ($p.reviewThreads.nodes[] | select(.comments.totalCount > 100) | "thread " + .id + " comments"),
     (if $p.comments.pageInfo.hasPreviousPage then "comments" else empty end),
     (if $p.reviews.pageInfo.hasPreviousPage then "reviews" else empty end),
     (if ($p.commits.nodes[0].commit.statusCheckRollup.contexts.pageInfo.hasNextPage // false) then "checks" else empty end)
   ]) as $truncated
| {
    viewer: $me, number: $p.number, url: $p.url, state: $p.state, draft: $p.isDraft,
    mergeable: $p.mergeable, merge_state: $p.mergeStateStatus, review_decision: $p.reviewDecision,
    head: $p.headRefName, head_oid: $p.headRefOid, base: $p.baseRefName, author: $p.author.login,
    pending_review: ([ $p.reviews.nodes[] | select(.state == "PENDING" and (.author.login // "") == $me) ] | length > 0),
    checks: { total: ($checks | length),
              pending: (([ $checks[] | select(.state == "pending") ] | length) - $quiet_pending),
              advisory_pending: $quiet_pending,
              failing: [ $checks[] | select(.state == "fail") ] },
    fail_run_ids: ([ $checks[] | select(.state == "fail" and .run_id != null) | .run_id ] | unique),
    threads: $threads, comments: $comments, reviews: $reviews, stale_verdicts: $stale_verdicts,
    reviewers: $reviewers, head_pushed_at: $pushed,
    complete: ($truncated | length == 0), truncated: $truncated,
    # base64 keeps the signature free of quotes, so sig_of can cut it out safely
    sig: ([ $p.state, $p.headRefOid, $p.mergeStateStatus,
            ($checks | map(.name + "=" + .state) | sort | join(",")),
            ($threads | map(.id + ":" + .rev) | join(",")),
            ($comments | map(.id + ":" + .rev) | join(",")),
            ($reviews | map(.id + ":" + .rev) | join(",")),
            ($stale_verdicts | map(.author + ":" + .review_id) | join(",")),
            ($reviewers | map(.login + ":" + .state) | join(",")),
            ($truncated | sort | join(",")) ] | join("|") | @base64)
  }
| tojson
JQ

# cfg for the reviewer check: the head's push time from the repository's
# activity log (cached per head; the commit date if not found) and GitHub's
# clock from a Date header, so timeouts never depend on the local clock.
# Sets CFG in the current shell; call it outside $(...).
CFG='def cfg: {reviewers: [], head: null, pushed: null, now: 0};' pushed_oid= pushed_at=
prepare_cfg() {
  [ -n "$reviewers" ] || return 0
  local info oid branch hrepo committed at date
  info=$(gh api graphql -f owner="$owner" -f name="$name" -F pr="$pr" -f query='
    query($owner:String!,$name:String!,$pr:Int!){ repository(owner:$owner,name:$name){ pullRequest(number:$pr){
      headRefOid headRefName headRepository { nameWithOwner } commits(last:1){ nodes { commit { committedDate } } } } } }' \
    --jq '.data.repository.pullRequest | [.headRefOid, .headRefName, (.headRepository.nameWithOwner // "-"),
          .commits.nodes[0].commit.committedDate] | join(" ")') || return 1
  read -r oid branch hrepo committed <<<"$info"
  if [ "$oid" != "$pushed_oid" ]; then
    at=
    [ "$hrepo" = - ] || at=$(gh api "repos/$hrepo/activity?ref=refs/heads/$branch&per_page=100" \
      --jq "[.[] | select(.after == \"$oid\")][0].timestamp // empty" 2>/dev/null) || at=
    pushed_oid=$oid pushed_at=${at:-$committed}
  fi
  date=$(gh api -i rate_limit 2>/dev/null | tr -d '\r' | sed -n 's/^[Dd]ate: //p' | head -n 1) || date=
  printf '%s' "$oid" | grep -Eq '^[0-9a-f]{40}$' || return 1
  printf '%s' "$pushed_at" | grep -Eq '^[0-9T:Z-]+$' || return 1
  printf '%s' "$date" | grep -Eq '^[A-Za-z]{3}, [0-9]{2} [A-Za-z]{3} [0-9]{4} [0-9:]{8} GMT$' || return 1
  CFG="def cfg: {reviewers: [$reviewers], head: \"$oid\", pushed: \"$pushed_at\",
    now: (\"$date\" | strptime(\"%a, %d %b %Y %H:%M:%S GMT\") | mktime)};"
}
snapshot() {
  gh api graphql -f query="$QUERY" -f owner="$owner" -f name="$name" -F pr="$pr" --jq "$CFG
$SHAPE"
}
sig_of() { printf '%s' "$1" | grep -o '"sig":"[^"]*"' || true; }

if [ "$wait" = 1 ]; then
  prepare_cfg; base=$(snapshot); base_sig=$(sig_of "$base"); waited=0; wake=timeout; snap=$base; ok=1
  # Activity beyond a cut-off page cannot be seen, so do not wait for it.
  case $base in *'"complete":false'*) wake=incomplete; timeout=0 ;; esac
  while [ "$waited" -lt "$timeout" ]; do
    sleep "$interval"; waited=$((waited + interval))
    # keep the last good snapshot; a failed poll never replaces it
    if prepare_cfg && next=$(snapshot); then snap=$next; ok=1; else ok=0; continue; fi
    if [ "$(sig_of "$snap")" != "$base_sig" ]; then wake=changed; break; fi
  done
  [ "$ok" = 1 ] || { echo "pr-snapshot: the last poll failed; GitHub state unknown" >&2; exit 1; }
  printf '{"wake":"%s","waited":%s,"snapshot":%s}\n' "$wake" "$waited" "$snap"
else
  prepare_cfg; snap=$(snapshot)
  printf '%s\n' "$snap"
fi

if [ "$logs" = 1 ]; then
  ids=$(printf '%s' "$snap" | grep -o '"fail_run_ids":\[[0-9,]*\]' | grep -o '[0-9][0-9]*' || true)
  for id in $ids; do
    printf '\n===== failed log: run %s =====\n' "$id"
    gh run view "$id" -R "$repo" --log-failed 2>&1 | tail -n 80 || true
  done
fi
