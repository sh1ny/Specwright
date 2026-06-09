# Research

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local findings

1. **The non-switching write path already exists.** `updateCachedChange()` at `src/core/state.ts:320-325` updates `state.changes[id]` without mutating `currentChange`. The `tasks` command already uses it for passive sync (`src/core/state.ts:220-221` via `syncChangeTasksFromFile`). The remaining commands (execute, verify, handoff, discuss, research, plan) still go through `upsertChange()` or `updateChangeStep()` which delegates to `upsertChange()`.

2. **Stale state persists in discuss/research/plan because they skip resync.** These commands read `change.tasks` from `state.json` without first reconciling against `tasks.md`. If a model edited `tasks.md` between plan and execute, the cached state is stale. `syncChangeTasksFromFileIfPresent` handles missing `tasks.md` gracefully (returns `{ change, issues: [], changed: false }`), so adding it to these commands is a safe no-op when no tasks exist yet.

3. **Checkpoint phase vs task paths have different sync behavior.** `--phase` checkpoint does not touch task parsing at all. `--task` checkpoint parses tasks but only stages `state.json` when the parsed task set differs from cache. This means metadata-only edits (Files/Action/Acceptance/Verification bullets) are committed in `tasks.md` but the matching `state.json` update is left dirty.

4. **OMP refresh already runs the full `status` command.** `refreshStatus` at `src/runtime/omp/status.ts:6` calls `runSpecwrightCommand(["status"])`, which already resyncs the current change's tasks (`src/core/commands.ts:412-414`). No OMP-layer changes are required; the fix is entirely in core commands.

5. **Handoff's split-brain concern is partially mitigated.** `commandHandoff` at `src/core/commands.ts:805` does call `syncChangeTasksForCommand` before reading `tasks.md` or computing `allDone`. However, it then calls `upsertChange()` which would switch the active change if run on an explicit non-current change.

## External findings

None. This change is mechanically constrained by existing local code.

## Implications

- The fix is a targeted refactor of command-level persistence calls, not a redesign of the state model.
- `updateChangeStep` should be changed to use `updateCachedChange` instead of `upsertChange`. Only `commandNew` and any future explicit "set current" feature should modify `currentChange`.
- Adding resync to discuss/research/plan is safe and cheap; the no-op path (missing tasks.md) is already exercised by every new change before the plan phase.
- The checkpoint staging fix requires only a conditional check: if `tasks.md` is in `--files`, always push `state.json` into `filesToStage`.
- All changes are testable with focused command-level tests; no end-to-end or browser tests needed.
