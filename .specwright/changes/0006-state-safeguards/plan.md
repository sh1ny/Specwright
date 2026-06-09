# Plan

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Decision

Implement state safeguards in core code, not prompt text. `tasks.md` is the model-editable source for task IDs, titles, and checkbox completion; `.specwright/state.json` is a CLI-owned derived cache that commands may synchronize.

Safe drift is auto-synced. Unsafe or ambiguous drift is reported by validation with a specific issue code. Passive sync must not switch `currentChange`.

Checkpoint is part of this plan: it must not fail because it dirtied derived `state.json` while staging only user-requested files. Phase checkpoints should avoid task parsing/writes; task checkpoints that need sync must stage any derived `state.json` mutation automatically.

## Implementation plan

1. Extract checklist parsing and task comparison into core state helpers shared by CLI and OMP paths.
2. Add a lower-level state update helper that can update one change without mutating `currentChange`; keep `new` behavior that intentionally sets the current change.
3. Wire safe sync before state-dependent commands: `status`, `tasks`, `execute`, `verify`, `handoff`, and task-aware checkpoint behavior.
4. Fix checkpoint side effects:
   - `--phase` checkpoints should not parse tasks or write `state.json` unless task metadata is needed.
   - `--task` checkpoints may sync/parse to validate the task ID, but if that changes `.specwright/state.json`, checkpoint must stage that derived file automatically.
5. Update OMP status refresh to call the shared core sync/status path instead of displaying raw cached state.
6. Add validator coverage for unreconciled drift such as malformed task lines, duplicate task IDs, missing task artifacts at execute-or-later phases, or cached tasks for missing artifacts.
7. Add tests for title drift, checkbox drift, preserved `in-progress`/`blocked` statuses, non-active change sync, checkpoint with derived state mutation, and OMP status refresh.

## Risks

- Over-syncing can erase runtime-only `in-progress` or `blocked` state; preserve those states for unchecked tasks when ID/title still match.
- Existing `upsertChange()` changes `currentChange`; using it for passive sync can silently switch the active change.
- Checkpoint can dirty `state.json` as a side effect; either avoid the mutation or include it in the checkpoint commit automatically.

