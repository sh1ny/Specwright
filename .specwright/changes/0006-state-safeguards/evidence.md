# Evidence

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local evidence

- Intent fixes the ownership model: `tasks.md` is the model-editable source for task IDs, titles, and checkbox completion; `.specwright/state.json` is a CLI-owned derived cache. See `intent.md:16-18`.
- Constraints require safe sync before `status`, `tasks`, `execute`, `verify`, and `handoff`; OMP status must use shared sync/status behavior; passive sync must not mutate `currentChange`; checkpoints must avoid or stage derived state mutations. See `constraints.md:13-21`.
- CLI status now resyncs `tasks.md` via `syncChangeTasksForCommand` before rendering progress: `src/core/commands.ts:412-414`.
- Shared task parsing lives in `src/core/state.ts` as `parseTaskArtifact`, which reads checkbox task lines and reports malformed lines and duplicate IDs: `src/core/state.ts:73-113`.
- `syncChangeTasksFromMarkdown` reconciles artifact tasks against cached state, preserves `in-progress`/`blocked` for unchecked matches, marks checked tasks as `done`, and emits sync issues for unrecoverable drift: `src/core/state.ts:179-228`.
- `syncChangeTasksFromFileIfPresent` reads `tasks.md`, reconciles via `syncChangeTasksFromMarkdown`, and only persists clean syncs via `updateCachedChange`: `src/core/state.ts:230-246`.
- `updateCachedChange` updates one cached change without mutating `currentChange`, making it safe for passive sync of non-active changes: `src/core/state.ts:325-330`.
- `upsertChange` no longer sets `state.currentChange`; it only updates the change record in cache: `src/core/state.ts:332-337`.
- `checkpoint` with `--task` syncs tasks, validates the task exists, rejects on sync issues, and stages derived state when clean: `src/core/commands.ts:724-737`.
- `tasks` command syncs `tasks.md` into state before returning its prompt: `src/core/commands.ts:747-751`.
- `execute` syncs tasks before selecting the next pending task, then writes `in-progress` state through `updateCachedChange`: `src/core/commands.ts:779-793`.
- `verify` computes sync result without persisting first, validates against original cached state, surfaces sync issues as `SW009` errors, and only persists after validation passes: `src/core/commands.ts:796-839`.
- `handoff` syncs tasks before computing completion from cached `change.tasks`, generating the handoff text from the same synced state: `src/core/commands.ts:841-860`.
- Validators compare `tasks.md` to cached task state via `unreconciledTaskDriftIssues` and report `SW009` for unreconciled drift, alongside existing `SW004`–`SW008` checks: `src/core/validators.ts:139-209`.
- OMP status refresh delegates to `runSpecwrightCommand(["status"])`, which includes full task sync, and serializes concurrent refreshes via `refreshInFlight`: `src/runtime/omp/status.ts:4-26`.
- OMP extension registers refresh hooks on `session_start`, `goal_updated`, and `turn_end`, ensuring status is recomputed after session changes: `src/runtime/omp/extension.ts:34-37`.
- Tests cover checkpoint selector failures and scoped staging, duplicate task IDs, task sync drift, non-active sync without `currentChange` mutation, command auto-sync, checkpoint sync-issue rejection, concurrent OMP refresh safety, and OMP command status: `test/core-commands.test.ts:236-376`, `test/core-commands.test.ts:456-564`, `test/core-commands.test.ts:596-705`, `test/core-commands.test.ts:998-1105`, `test/core-validators.test.ts:9-147`, `test/omp-extension.test.ts:10-246`.

## Research attempts

- Read required change artifacts: `intent.md`, `constraints.md`, `research.md`, `sources.md`, `evidence.md`, and `options.md`.
- Ran read-only scout `CoreStateScout` over core command/state/types/tests. It confirmed command-local task parsing, `upsertChange()` current-change coupling, checkpoint side effects, and missing drift tests.
- Ran read-only scout `ValidationOmpScout` over validators and OMP runtime/tests. It confirmed validator task-shape coverage, lack of cache-vs-artifact drift validation, and OMP raw-cache status refresh.
- Online research not used. `online=auto`; this change is mechanically constrained by local CLI/OMP state behavior and does not depend on external APIs, standards, dependency semantics, or recent third-party behavior.
- Re-ran bounded local evidence confirmation after discuss reconfirmation. Post-implementation source paths verified: `src/core/commands.ts:407-860`, `src/core/state.ts:73-337`, `src/core/validators.ts:139-209`, `src/runtime/omp/status.ts:4-26`, and `src/runtime/omp/extension.ts:34-37`.

## Decisions supported

- Move task parsing/reconciliation into shared core code because CLI commands, validators, and OMP need one artifact-to-cache interpretation.
- Add a passive state update helper because safe sync must not call `upsertChange()` when syncing a non-active change.
- Reorder checkpoint handling so phase checkpoints do not parse tasks, and task checkpoints stage derived `.specwright/state.json` when sync mutates it.
- Extend validation with a specific unreconciled-drift issue code for cache/artifact mismatches that cannot be safely auto-synced.
