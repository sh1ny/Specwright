# Options

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Option 1: Central task sync in core state helpers

Move task-line parsing and reconciliation into shared core state code. Add a passive change update helper that writes `state.changes[id]` without changing `currentChange`. Commands and OMP status call the shared sync path before reading state-dependent task data. Validators reuse the same parser/reconciliation diagnostics for unreconciled drift.

Pros:
- One interpretation of task checkbox/title state across CLI, OMP, and validators.
- Directly fixes passive non-active sync by avoiding `upsertChange()` where current-change mutation is wrong.
- Makes checkpoint behavior explicit: phase paths skip sync; task paths can detect and stage derived state mutations.

Cons:
- Touches several command surfaces in one change.
- Requires careful tests around when `currentChange` should and should not change.

## Option 2: Command-local minimal patch

Keep task parsing in `src/core/commands.ts`. Add more calls to `parseTasksFromFile()` before `status`, `verify`, and `handoff`; special-case checkpoint to avoid parsing for `--phase`; add a second local parser or exported helper for OMP and validators as needed.

Pros:
- Smaller initial diff in the core state module.
- Faster to patch the most visible stale-cache cases.

Cons:
- Preserves multiple parser/read paths and makes drift semantics harder to maintain.
- Does not naturally solve OMP and validators without exporting command internals or duplicating parsing.
- Easy to reintroduce `upsertChange()` current-change bugs in passive sync paths.

## Option 3: Validator-only enforcement, no auto-sync

Leave state writes mostly unchanged. Validators report when `.specwright/state.json` and `tasks.md` diverge; users or agents rerun `specwright tasks` or another repair path to refresh derived state.

Pros:
- Lowest write-path risk.
- Clear failure mode for ambiguous drift.

Cons:
- Violates product constraints that normal user-facing commands should auto-sync safe drift and that users should not hand-edit/repair cache state.
- Does not fix OMP stale badge refresh after session refresh.
- Makes `state.json` feel user-owned even though it is supposed to be CLI-owned derived cache.

## Recommendation

Choose Option 1. It matches the approved ownership model: `tasks.md` is the artifact source of truth, `.specwright/state.json` is a derived cache, and all state-dependent surfaces share one safe sync contract. Option 2 is tempting but leaves parser duplication and passive-sync hazards. Option 3 contradicts the stated product constraint to auto-sync safe drift.
