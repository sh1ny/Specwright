# Evidence

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local evidence

- Intent fixes the ownership model: `tasks.md` is the model-editable source for task IDs, titles, and checkbox completion; `.specwright/state.json` is a CLI-owned derived cache. See `intent.md:16-18`.
- Constraints require safe sync before `status`, `tasks`, `execute`, `verify`, and `handoff`; OMP status must use shared sync/status behavior; passive sync must not mutate `currentChange`; checkpoints must avoid or stage derived state mutations. See `constraints.md:13-21`.
- CLI status currently reads cached state directly with `loadState()` and does not parse or reconcile `tasks.md`: `src/core/commands.ts:404-414`.
- Task parsing is currently local to `src/core/commands.ts`. `parseTasks()` reads checkbox task lines, sets checked tasks to `done`, preserves `in-progress`/`blocked` for unchecked cached matches, otherwise uses `pending`: `src/core/commands.ts:629-640`.
- `parseTasksFromFile()` reads `tasks.md`, rebuilds cached task state, and writes via `upsertChange()`: `src/core/commands.ts:643-648`.
- `upsertChange()` always assigns `state.currentChange = change.id`, so it is unsafe for passive sync of a non-active change: `src/core/state.ts:122-127`.
- `checkpoint` currently parses tasks before it validates whether the request is `--phase` or `--task`, then stages only explicitly listed files. This explains phase-checkpoint `state.json` side effects: `src/core/commands.ts:677-711`.
- `tasks` command always parses `tasks.md` into state before returning its prompt: `src/core/commands.ts:714-739`.
- `execute` only parses `tasks.md` when cached tasks are empty, then writes `in-progress` state through `upsertChange()`: `src/core/commands.ts:747-763`.
- `verify` validates artifacts but does not reconcile cached tasks before validation or status update: `src/core/commands.ts:766-779`.
- `handoff` computes completion from cached `change.tasks` while separately reading raw `tasks.md` for the handoff text, so stale cache can affect final status: `src/core/commands.ts:781-800`.
- Validators already parse `tasks.md` task blocks and report `SW004` duplicate IDs, `SW005` missing execute-stage tasks, `SW006` missing acceptance/verification, and `SW008` all-done-without-output. They do not compare `tasks.md` to cached task state: `src/core/validators.ts:101-199`.
- OMP status refresh reads `.specwright/state.json` directly with `readJsonFile()` and renders cached current/status without shared core reconciliation: `src/runtime/omp/status.ts:1-18`.
- OMP extension registers refresh hooks on `session_start`, `goal_updated`, and `turn_end`, so stale cache can be re-shown repeatedly after session refresh: `src/runtime/omp/extension.ts:34-37`.
- Existing tests cover checkpoint selector failures and scoped staging, duplicate task IDs, and basic OMP command status, but not task drift sync, non-active sync, checkpoint derived-state handling, or OMP refresh drift: `test/core-commands.test.ts:235-282`, `test/core-validators.test.ts:9-22`, `test/omp-extension.test.ts:16-40`.

## Research attempts

- Read required change artifacts: `intent.md`, `constraints.md`, `research.md`, `sources.md`, `evidence.md`, and `options.md`.
- Ran read-only scout `CoreStateScout` over core command/state/types/tests. It confirmed command-local task parsing, `upsertChange()` current-change coupling, checkpoint side effects, and missing drift tests.
- Ran read-only scout `ValidationOmpScout` over validators and OMP runtime/tests. It confirmed validator task-shape coverage, lack of cache-vs-artifact drift validation, and OMP raw-cache status refresh.
- Online research not used. `online=auto`; this change is mechanically constrained by local CLI/OMP state behavior and does not depend on external APIs, standards, dependency semantics, or recent third-party behavior.
- Re-ran bounded local evidence confirmation after discuss reconfirmation. Current source still matches the recorded findings: `src/core/commands.ts:404-800`, `src/core/state.ts:82-127`, `src/core/validators.ts:101-199`, `src/runtime/omp/status.ts:1-18`, and `src/runtime/omp/extension.ts:34-37`.

## Decisions supported

- Move task parsing/reconciliation into shared core code because CLI commands, validators, and OMP need one artifact-to-cache interpretation.
- Add a passive state update helper because safe sync must not call `upsertChange()` when syncing a non-active change.
- Reorder checkpoint handling so phase checkpoints do not parse tasks, and task checkpoints stage derived `.specwright/state.json` when sync mutates it.
- Extend validation with a specific unreconciled-drift issue code for cache/artifact mismatches that cannot be safely auto-synced.
