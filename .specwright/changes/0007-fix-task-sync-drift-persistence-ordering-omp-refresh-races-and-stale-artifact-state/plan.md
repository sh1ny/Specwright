# Plan

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Decision

Adopt six persistence fixes derived from `evidence.md`:

1. **Emit cached-task-without-artifact issues during sync** (`evidence.md`: cached `in-progress` or `blocked` tasks are silently deleted when they disappear from `tasks.md`). `syncChangeTasksFromMarkdown` must emit a `cached-task-without-artifact` issue for every task ID present in `change.tasks` but missing from the parsed artifact, so callers and validators can surface SW009 before the cache is overwritten.

2. **Gate sync persistence on clean results** (`evidence.md`: "State-dependent commands currently overwrite drift before validation can detect it"). `syncChangeTasksFromFileIfPresent` must not call `updateCachedChange` when `syncChangeTasksFromMarkdown` returns issues. Callers must handle non-clean results explicitly rather than silently persisting drift.

3. **Separate active-change switching from `upsertChange`** (`evidence.md`: "`upsertChange()` unconditionally sets `state.currentChange`"). Change `updateChangeStep` to use `updateCachedChange` instead of `upsertChange`. Update `commandExecute` and `commandHandoff` to use `updateCachedChange`. Only `commandNew` may mutate `currentChange`.

4. **Universal auto-resync before all change-touching commands** (`evidence.md`: "`commandDiscuss` does NOT resync", "`commandResearch` does NOT resync", "`commandPlan` does NOT resync"). Add `syncChangeTasksForCommand` to `commandDiscuss`, `commandResearch`, and `commandPlan` before proceeding. `syncChangeTasksFromFileIfPresent` safely no-ops when `tasks.md` is missing, so this is safe for pre-task phases.

5. **Conservative checkpoint staging** (`evidence.md`: "`syncResult.changed` can be false even when `tasks.md` was modified"). When `tasks.md` is in `--files`, always include `.specwright/state.json` in `filesToStage`, regardless of `syncResult.changed`. Also fail or surface sync issues before staging derived state.

6. **Serialize concurrent OMP status refreshes** (`evidence.md`: temp-path collision on `state.json.tmp-${process.pid}`). Guard `refreshStatus` so overlapping calls do not race on the same temporary file path.

## Implementation plan

Grouped into dependency waves. Independent waves may proceed in parallel; tasks within a wave are safe to execute sequentially in ID order.

### Wave 1 — Core sync correctness
- **T001**: Emit `cached-task-without-artifact` issues in `syncChangeTasksFromMarkdown`.
- **T002**: Gate `syncChangeTasksFromFileIfPresent` persistence on `issues.length === 0`.

### Wave 2 — State write safety
- **T005**: Serialize concurrent OMP `refreshStatus` calls.
- **T008**: Remove active-change switching from `upsertChange`; use `updateCachedChange` in `updateChangeStep`, `commandExecute`, and `commandHandoff`.

### Wave 3 — Command consistency
- **T009**: Add auto-resync to `commandDiscuss`, `commandResearch`, and `commandPlan`.
- **T010**: Always stage `state.json` when `tasks.md` is in checkpoint `--files`.
- **T003**: Reorder `commandVerify` so validation compares against pre-sync state or rejects unreconciled sync results before persisting.
- **T004**: Fail or surface sync issues in `commandCheckpoint` `--task` before staging derived state.

### Wave 4 — Artifact cleanup
- **T006**: Manually sync change 0006's stale `state.json` to match its checked tasks.
- **T007**: Correct test count in 0006 `verify.md` and refresh 0006 `evidence.md`.

## Risks

- **Interaction between T003 and T002**: After T002, `syncChangeTasksForCommand` no longer persists on dirty syncs, but it still returns a mutated `change` object. `commandVerify` must run `validateChange` against the original cached state (or a copy), not the post-sync object, or SW009 drift detection will be masked.
- **Regression in checkpoint behavior**: T004 and T010 both modify `commandCheckpoint`. The combination of always-staging `state.json` and failing on sync issues must be exercised together.
- **Test coverage gaps**: `evidence.md` lists 8 missing tests corresponding to T003, T004, T008, T009, and T010. Each task must add its corresponding test.
- **OMP refresh latency**: T005 serialization could delay status updates if events fire rapidly. The guard must be lightweight (promise-chain, not a mutex/lock).
