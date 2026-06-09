# Discussion

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Conversation notes

- Prepared artifacts for change 0006 were empty placeholders before discussion (`intent.md`, `constraints.md`, `decisions.md`).
- Local evidence: `STATE-SAFEGUARDS.md:11-24` names the drift problem and proposed source-of-truth split: `tasks.md` is model-editable, `state.json` is CLI-owned derived cache.
- Local evidence: `STATE-SAFEGUARDS.md:47-55` proposes a sync helper that updates cached task metadata only when parsed artifact state differs.
- Local evidence: `STATE-SAFEGUARDS.md:57-67` names state-dependent commands that need sync: `status`, `tasks`, `execute`, `verify`, `handoff`.
- Local evidence: `STATE-SAFEGUARDS.md:69-73` says OMP status refresh currently needs the shared status/sync path because refresh runs on session events.
- Local evidence: `src/core/state.ts:122-127` shows `upsertChange()` currently sets `state.currentChange = change.id`, so passive sync needs a helper that does not switch the active change.
- Local evidence from source search: `src/runtime/omp/status.ts:14-18` derives the badge directly from `state.currentChange` and cached change status.

## Open questions

None after discussion checkpoint.

## Settled decisions

- Question: When `tasks.md` and `state.json` disagree on task IDs, titles, or checkboxes, what should normal state-dependent commands do? Answer: Auto-sync safe drift. Source evidence: `STATE-SAFEGUARDS.md:83-87`.
- Question: How should OMP session status refresh handle synchronization? Answer: Use a shared core sync/status path. Source evidence: `STATE-SAFEGUARDS.md:69-73`.
- Question: For unchecked tasks in `tasks.md`, should cached runtime statuses survive sync? Answer: Preserve `in-progress` and `blocked` when ID/title still match; checked tasks become `done`. Source evidence: `STATE-SAFEGUARDS.md:37-43`.
- Question: Which scope belongs in change 0006? Answer: Minimum safeguards only: parser/sync, command wiring, validator drift code, OMP status refresh, and focused tests. Explicit task add/sync commands are deferred. Source evidence: `STATE-SAFEGUARDS.md:97-113`.

