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
- Local evidence from the checkpoint retry: bare `specwright checkpoint ...` now resolves, but it failed when `commandCheckpoint()` dirtied `.specwright/state.json` and staged only the four requested discussion files.
- Local evidence: `src/core/commands.ts:679-680` parses tasks during checkpoint when cached tasks are empty; `src/core/commands.ts:643-648` writes `state.json`; `src/core/commands.ts:709-710` stages only `args.files`.

## Open questions

None after discussion checkpoint.

## Settled decisions

- Question: When `tasks.md` and `state.json` disagree on task IDs, titles, or checkboxes, what should normal state-dependent commands do? Answer: Auto-sync safe drift. Source evidence: `STATE-SAFEGUARDS.md:83-87`.
- Question: How should OMP session status refresh handle synchronization? Answer: Use a shared core sync/status path. Source evidence: `STATE-SAFEGUARDS.md:69-73`.
- Question: For unchecked tasks in `tasks.md`, should cached runtime statuses survive sync? Answer: Preserve `in-progress` and `blocked` when ID/title still match; checked tasks become `done`. Source evidence: `STATE-SAFEGUARDS.md:37-43`.
- Question: Which scope belongs in change 0006? Answer: Minimum safeguards only: parser/sync, command wiring, validator drift code, OMP status refresh, checkpoint side-effect handling, and focused tests. Explicit task add/sync commands are deferred. Source evidence: `STATE-SAFEGUARDS.md:114-131`.
- Follow-up decision: checkpoint belongs in the minimum safeguards scope. Phase checkpoints should avoid unnecessary task parsing/writes; task checkpoints that need sync must automatically include any derived `.specwright/state.json` mutation they caused. Source evidence: observed checkpoint failure, `STATE-SAFEGUARDS.md:96-112`, and `src/core/commands.ts:679-710`.

## Reconfirmed decisions

- Question: When `tasks.md` and cached `state.json` task metadata disagree safely, what should normal commands do? Settled answer: Auto-sync safe drift. Source evidence: `STATE-SAFEGUARDS.md:45-67`, `src/core/commands.ts:629-648`.
- Question: For unchecked tasks, which cached task statuses should survive sync? Settled answer: Preserve `in-progress` and `blocked` when task ID/title still match; checked boxes become `done`. Source evidence: `STATE-SAFEGUARDS.md:37-43`, `src/core/commands.ts:629-640`.
- Question: How should checkpoints handle derived `state.json` mutations caused by sync? Settled answer: Phase checkpoints avoid unnecessary sync; task checkpoints auto-stage derived `.specwright/state.json` if they caused it. Source evidence: `STATE-SAFEGUARDS.md:96-112`, `src/core/commands.ts:677-711`.
- Question: What belongs in change 0006 scope? Settled answer: Minimum safeguards only: parser/sync, passive state updates, command wiring, validator drift issue, OMP status refresh, checkpoint fix, and focused tests. Source evidence: `STATE-SAFEGUARDS.md:114-131`, `src/runtime/omp/status.ts:6-18`.

Ready for research.

