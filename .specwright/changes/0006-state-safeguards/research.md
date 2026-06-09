# Research

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local findings

`tasks.md` and `.specwright/state.json` currently have split ownership but no shared reconciliation layer. The only parser for executable task lines lives inside `src/core/commands.ts` as `parseTasks()` / `parseTasksFromFile()` (`src/core/commands.ts:629-648`). That parser already encodes the desired safe-sync rule for checked tasks and unchecked `in-progress`/`blocked` tasks, but it is command-private and persists through `upsertChange()`.

The state write primitive is too broad for passive sync. `upsertChange()` always writes the change and assigns `currentChange` to that change (`src/core/state.ts:122-127`). That is correct for deliberate lifecycle transitions such as `new` or `execute`, but unsafe when a background/status path syncs a non-active change.

State-dependent command behavior is inconsistent. `status` reads cache only (`src/core/commands.ts:404-414`); `tasks` always parses (`src/core/commands.ts:714-739`); `execute` parses only when cache is empty (`src/core/commands.ts:747-763`); `verify` validates artifacts but does not sync cached tasks (`src/core/commands.ts:766-779`); `handoff` reads raw `tasks.md` for text but uses cached task statuses for completion (`src/core/commands.ts:781-800`).

Checkpoint has a confirmed side-effect hazard: it parses tasks before determining whether the request is phase- or task-scoped, and then stages only user-listed files (`src/core/commands.ts:677-711`). This makes `checkpoint --phase` able to dirty derived state even when task metadata is not needed.

Validators already understand task blocks but only for artifact shape checks. They emit `SW004`, `SW005`, `SW006`, and `SW008` from `tasks.md` content (`src/core/validators.ts:101-199`) and do not compare the artifact with cached `change.tasks`.

OMP status bypasses the core command path. `refreshStatus()` reads `.specwright/state.json` directly and renders cached current/status (`src/runtime/omp/status.ts:1-18`), while extension hooks refresh on session start, goal update, and turn end (`src/runtime/omp/extension.ts:34-37`). Badge refresh can therefore repeat stale cache after `tasks.md` changes.

## External findings

No external sources were needed. With `online=auto`, this is a local state/cache consistency change constrained by existing Specwright code paths, not by third-party APIs, standards, competitor behavior, or recent dependency changes.

## Implications

- The implementation should extract task parsing/reconciliation into shared core code instead of adding another parser in validators or OMP.
- Passive sync needs a state helper that updates one change without changing `currentChange`.
- Command wiring should make artifact truth visible before `status`, `tasks`, `execute`, `verify`, and `handoff` rely on cached task data.
- Checkpoint must branch before task parsing: phase checkpoints skip sync; task checkpoints sync to validate the task and stage derived state if it changed.
- Validator drift reporting should reuse shared parsing semantics and add one specific issue code for unreconciled cache/artifact drift.
