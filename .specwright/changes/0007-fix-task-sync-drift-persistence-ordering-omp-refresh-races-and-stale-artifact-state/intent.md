# Intent

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">
## Goal

Eliminate four categories of state/artifact inconsistency in Specwright:
1. **Task sync drift** — `tasks.md` and `state.json` fall out of sync when models edit tasks.md but the CLI hasn't resynced.
2. **Persistence ordering** — `state.json` is not reliably staged alongside `tasks.md` during checkpoint.
3. **OMP refresh races** — The OMP status bar may show stale task counts because `refreshStatus` reads cached state without resyncing.
4. **Stale artifact state** — Commands like `handoff` read `tasks.md` directly but compute `allDone` from cached state, producing split-brain output.

## Users

AI agents and human developers using Specwright through both CLI and OMP.

## Non-goals

- Changing the tasks.md format or parsing rules.
- Adding new lifecycle phases.
- Rewriting the git branching model.
</frozen-after-approval>

## Approval notes

All four gray areas settled in discussion.md:
- `upsertChange()` no longer implicitly switches active change.
- All change-touching commands auto-resync tasks.md before proceeding.
- Checkpoint always stages `state.json` when `tasks.md` is in `--files`.
- OMP `refreshStatus` runs full status (including resync).
