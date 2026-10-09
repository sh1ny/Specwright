# 0003. Git and GitHub as the state store

- Status: accepted
- Date: 2026-10-09
- Supersedes: —

## Context
Agents are interrupted often: context limits, crashes, hand-offs between sessions and harnesses. A later run must find out what was done without trusting a transcript. Several agents may work on one machine at once.

## Decision
Durable workflow evidence lives where every agent can read it. In git history: task commit subjects, the `Feedback-Round:` and `Code-Changes: none` trailers, the legacy `address review feedback` subject (counted as a round when a branch has no trailers), archive and merge subjects, and the planning-only marker (`specwright-change.yaml` in a store archive). On GitHub: PR state and Specwright's comment markers: `specwright:handled <id>` (with a trailing `resolve` when the thread is to be resolved) and `specwright:waiting` on replies, `specwright:link` on pair-link comments, and `specwright:pr-item` in after-limit issue bodies. Status, completion and round counts are derived from that evidence and never stored separately. Local state is limited to working state that can be rebuilt or safely asked about, all under `~/.cache/specwright/` (or `SPECWRIGHT_STATE_DIR`) except the lock: the feedback pass record, the watch ownership token (the newest `pr-snapshot.sh --wait` on a PR owns it) and the store gate lock.

**Rejected: a Specwright state file or database per project.** It would be easier to query, but it is a second source of truth that drifts from git, needs locking across agents, and is missing or stale on another machine.

**Reversal cost: high.** Later runs and roadmap status parse the commit and marker formats, so changing them needs a migration for changes in flight.

## Consequences
- Commit subjects, trailers, the planning-only marker and the GitHub comment markers are data formats. Changing one is a workflow change (minor version).
- Recovery logic (Reconcile, pass records) must tell real gaps from pending work.
- Without access to GitHub, PR-related status is unknown and is reported as such.
