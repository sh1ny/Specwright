# 0003. Git and GitHub as the state store

- Status: accepted
- Date: 2026-10-09
- Supersedes: —

## Context
Agents are interrupted often: context limits, crashes, hand-offs between sessions and harnesses. A later run must find out what was done without trusting a transcript. Several agents may work on one machine at once.

## Decision
Durable workflow evidence lives where every agent can read it. In git history: task commit subjects, the `Feedback-Round:` and `Code-Changes: none` trailers, and archive and merge subjects. On GitHub: PR state and `specwright:handled` reply markers. Status, completion and round counts are derived from that evidence and never stored separately. Local state is limited to working state that can be rebuilt or safely asked about, all under `~/.cache/specwright/` (or `SPECWRIGHT_STATE_DIR`) except the lock: the feedback pass record, the watch ownership token (the newest `pr-snapshot.sh --wait` on a PR owns it) and the store gate lock.

**Rejected: a Specwright state file or database per project.** It would be easier to query, but it is a second source of truth that drifts from git, needs locking across agents, and is missing or stale on another machine.

**Reversal cost: high.** Later runs and roadmap status parse the commit and marker formats, so changing them needs a migration for changes in flight.

## Consequences
- Commit subjects and trailers are a data format. Changing them is a workflow change (minor version).
- Recovery logic (Reconcile, pass records) must tell real gaps from pending work.
- Without access to GitHub, PR-related status is unknown and is reported as such.
