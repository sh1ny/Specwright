# Evidence

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local evidence

### Active-change switching root cause
- `upsertChange()` at `src/core/state.ts:327-333` unconditionally sets `state.currentChange = change.id`.
- `updateChangeStep()` at `src/core/commands.ts:552-556` calls `upsertChange()`, so any command using it (discuss, research, plan, verify) silently switches active change.
- `commandExecute` at `src/core/commands.ts:781` calls `upsertChange()` directly.
- `commandHandoff` at `src/core/commands.ts:821` calls `upsertChange()` directly.
- `commandNew` at `src/core/commands.ts:521-524` sets `currentChange` explicitly via direct `state` mutation, so it does not need `upsertChange`'s side effect.
- The `tasks` command already avoids switching: it calls `syncChangeTasksForCommand` which delegates to `syncChangeTasksFromFileIfPresent`, which on change calls `updateCachedChange` (not `upsertChange`). The test `"task file sync updates a non-current change without changing currentChange"` at `test/core-commands.test.ts:445-466` verifies this.

### Stale task state in non-resyncing commands
- `commandStatus` already resyncs: `src/core/commands.ts:412-414`.
- `commandDiscuss` does NOT resync: `src/core/commands.ts:577-585`.
- `commandResearch` does NOT resync: `src/core/commands.ts:587-621`.
- `commandPlan` does NOT resync: `src/core/commands.ts:623-661`.
- `commandExecute` resyncs: `src/core/commands.ts:773`.
- `commandVerify` resyncs: `src/core/commands.ts:790`.
- `commandHandoff` resyncs: `src/core/commands.ts:805`.
- `syncChangeTasksFromFileIfPresent` safely no-ops when `tasks.md` is missing (`src/core/state.ts:225-241`), so adding it to discuss/research/plan is safe even before tasks exist.

### Checkpoint state.json staging gap
- `commandCheckpoint` with `--task` only stages `state.json` when `syncResult.changed` is true (`src/core/commands.ts:723-728`).
- If a model edits task metadata (Files/Action/Acceptance/Verification bullets) without changing checkbox/title, `taskStatesEqual` returns true and `syncResult.changed` is false, so `state.json` is omitted from the commit even though `tasks.md` is staged.
- `commandCheckpoint` with `--phase` does not resync at all (`test/core-commands.test.ts:285-304` confirms no state change on phase checkpoint).

### OMP refresh already uses full status
- `refreshStatus` calls `runSpecwrightCommand(["status"])` (`src/runtime/omp/status.ts:6`).
- Since `commandStatus` already resyncs tasks, the OMP layer does not need modification for this fix. The test `"OMP status refresh syncs tasks.md before rendering status"` at `test/omp-extension.test.ts:44-101` already passes.

### Existing test coverage for task sync
- `status syncs task artifact changes before rendering progress` (`test/core-commands.test.ts:498-509`)
- `execute syncs task artifact changes before selecting next pending task` (`test/core-commands.test.ts:511-524`)
- `verify syncs task artifact changes before updating change status` (`test/core-commands.test.ts:526-539`)
- `handoff syncs task artifact changes before computing completion` (`test/core-commands.test.ts:541-555`)
- `task file sync updates a non-current change without changing currentChange` (`test/core-commands.test.ts:445-466`)

### Missing test coverage (gaps to fill)
- No test that `discuss` resyncs tasks when tasks.md exists.
- No test that `research` resyncs tasks when tasks.md exists.
- No test that `plan` resyncs tasks when tasks.md exists.
- No test that `execute` on an explicit non-current change does not switch `currentChange`.
- No test that `verify` on an explicit non-current change does not switch `currentChange`.
- No test that `handoff` on an explicit non-current change does not switch `currentChange`.
- No test that checkpoint `--phase` stages `state.json` when `tasks.md` is in `--files`.
- No test that checkpoint `--task` stages `state.json` even when only metadata (not checkbox/title) changed.

## Research attempts

No external research needed. This change is mechanically constrained by local CLI/OMP state behavior.

## Decisions supported

- Decision 1 (separate upsertChange from active-change switching): Supported by evidence that `updateCachedChange` already exists and `tasks` command already uses it safely.
- Decision 2 (universal auto-resync): Supported by evidence that `syncChangeTasksFromFileIfPresent` safely no-ops when tasks.md is missing.
- Decision 3 (conservative checkpoint staging): Supported by evidence that `syncResult.changed` can be false even when tasks.md was modified.
- Decision 4 (accurate OMP refresh): Supported by evidence that OMP already calls full `status` command.
