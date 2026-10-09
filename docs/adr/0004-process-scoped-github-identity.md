# 0004. Process-scoped GitHub identity

- Status: proposed
- Date: 2026-10-09
- Supersedes: —

## Context
Several agents share one `gh` login store. `gh auth switch` changes the active account for every process, so one agent switching redirects another agent's pushes and comments mid-flight. Some actions must come from a specific account: the bot account in general, or the user's account for review requests.

## Decision
When a login is configured (`github.login`, `planning_store.login`, `github.review_request.login`, `pr.request_as`), every authenticated `gh` call for it runs under a process-scoped fence: normally `as.sh <login>`, which resolves that login's token for the one process, verifies the identity with `gh api user`, and pins git's HTTPS credentials to it with SSH disabled. `pr-pair.sh` has an equivalent internal fence for pair-wide reads of the store under `planning_store.login`: it resolves and verifies that login's token the same way and passes it to `gh` as `GH_TOKEN` for each call. Specwright never runs `gh auth switch`. A missing or mismatched credential stops the step.

With no login configured (`github.login: ""`, the shipped default), calls use the active `gh` account unfenced. This exception is documented as unsafe when agents run concurrently and is tracked as a known gap (sh1ny/specwright#38): a later change should make the fence the default, for example by fencing the active login that was resolved once at the start of the run. `git fetch` and `git pull` on main (branch gate, roadmap status, finish and pr cleanup) run with the ambient git credentials, unfenced, and so does one `gh` call even with a login configured: `specwright-finish` checks the merged PR with a plain `gh pr view` (also tracked in #38).

**Rejected: rely on the active `gh` account.** It needs no setup, but it races with concurrent agents and can silently act as the wrong account.

**Reversal cost: low.** `as.sh` is a single wrapper, and callers pass it a login.

## Consequences
- Requires `gh` 2.40 or later (`gh auth token --user`).
- Inside the fence, pushes use HTTPS with the pinned token; SSH remotes are not used.
