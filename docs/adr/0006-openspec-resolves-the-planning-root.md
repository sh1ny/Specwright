# 0006. OpenSpec resolves the planning root

- Status: accepted
- Date: 2026-10-09
- Supersedes: —

## Context
Planning can live in the code repo, in a folder nested in it, or in a separate planning store shared by several code repos (OpenSpec stores). Assuming `./openspec/` would write planning into the wrong repo.

## Decision
Every skill that reads or writes planning state (`specwright-branch`, `-commit`, `-finish`, `-pr` and `-roadmap`) resolves the planning root with `openspec list --json` before any write, and compares git common dirs to classify it as repo-local or store-backed. A store-backed change has a branch with the same name in both repos. Its commits pair by phase:
- **Task with code:** the code commit comes first, then the matching `tasks.md` tick in the store, with the same subject.
- **Task without code:** a store commit only, with `Code-Changes: none`.
- **Planning and archive commits:** may be store-only.
- **Feedback fixes:** commits in either repo share the round's `Feedback-Round:` trailer; the store is committed and pushed first.

In PR mode, the PRs follow the expected set from `pr-pair.sh expected`. It can hold the store only, the code only, both, or neither, and when both exist they are linked to each other.

Referenced stores are read-only.

**Rejected: a Specwright setting for where planning lives.** It would duplicate OpenSpec's own resolution and drift from it.

**Reversal cost: medium to high.** Commit pairing and PR-pair evidence are stored formats (see ADR 0003).

## Consequences
- Every git write in the store goes through a branch check, plus the store lock during the branch gate.
- The status of a store-backed change needs proof from both repos.
