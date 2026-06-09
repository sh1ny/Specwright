# Discussion

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Conversation notes

### Evidence gathered

- `upsertChange()` always sets `state.currentChange = change.id` (`src/core/state.ts:327-333`). This means any command that updates a change (execute, verify, handoff, checkpoint, tasks on another change) silently switches the active change.
- `syncChangeTasksFromFileIfPresent()` only resyncs tasks.md when it exists (`src/core/state.ts:225-241`). Commands like `status`, `discuss`, `research`, `plan` do not call it, so stale task state persists in state.json until a resyncing command runs.
- `commandCheckpoint` with `--task` adds `state.json` to staged files only when `syncResult.changed` is true (`src/core/commands.ts:723-728`). If a model edits task metadata (Files/Action/Acceptance/Verification bullets) without changing checkboxes or titles, `syncResult.changed` is false and state.json is not staged—even though tasks.md itself is in `--files`.
- `refreshStatus` runs on `session_start`, `goal_updated`, and `turn_end` (`src/runtime/omp/extension.ts:34-36`). Each invocation runs `runSpecwrightCommand(["status"])`, which currently resyncs the current change's tasks (`src/core/commands.ts:412-414`). If task resync expands to more commands, the I/O load per turn increases.
- `validateChange` detects unreconciled task drift (`src/core/validators.ts:139-209`) but is only invoked at `verify` and `handoff`. A model can checkpoint a malformed tasks.md without error until much later.
- `commandHandoff` reads tasks.md directly (`src/core/commands.ts:807-814`) but does not sync it to state before computing `allDone`, creating a split-brain between the handoff's task list and the state's task progress.

## Open questions

## Settled decisions

1. **Active change switching** — Only `new` and explicit set-current should switch the active change. `upsertChange()` must not set `currentChange` implicitly. This prevents `specwright verify 0003` from silently flipping the active change.

2. **Auto-resync scope** — Every command that touches a change (status, discuss, research, plan, execute, verify, handoff) must call `syncChangeTasksForCommand()` before using cached state. This eliminates stale task state across all read paths.

3. **Checkpoint state.json staging** — If `tasks.md` is in `--files`, checkpoint must always include `state.json` in the stage list. Conservative approach ensures `state.json` never lags `tasks.md`.

4. **OMP refresh behavior** — `refreshStatus` should run the full `status` command including task resync. Accept the I/O cost to keep the status bar accurate on every `turn_end` / `goal_updated`.