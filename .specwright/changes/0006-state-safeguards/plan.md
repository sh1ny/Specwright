# Plan

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Decision

Implement state safeguards in core code, not prompt text. `tasks.md` is the model-editable source for task IDs, task titles, and checkbox completion; `.specwright/state.json` is a CLI-owned derived cache that commands may synchronize.

Safe drift is auto-synced. Unsafe or ambiguous drift is reported by validation with a specific issue code. Passive sync must not switch `currentChange`.

Checkpoint behavior is part of this change. Phase checkpoints must not parse tasks or write `.specwright/state.json` unless task metadata is required. Task checkpoints may sync to validate a task ID, but if sync mutates derived state then checkpoint must stage that derived file automatically.

## Evidence summary

- Approved intent says `state.json` is derived CLI cache and `tasks.md` is authoritative for task IDs, titles, and checkbox completion: `.specwright/changes/0006-state-safeguards/intent.md:16-18`.
- Constraints require safe sync before `status`, `tasks`, `execute`, `verify`, and `handoff`; OMP status must use shared sync/status behavior; passive sync must not mutate `currentChange`: `.specwright/changes/0006-state-safeguards/constraints.md:13-21`.
- `evidence.md` currently contains only empty evidence headings, so this plan cites the artifact gap directly and uses the approved intent/constraints plus observed local source citations as the implementation basis: `.specwright/changes/0006-state-safeguards/evidence.md:5-9`.
- Current task parsing is private to commands and writes through `upsertChange()`: `src/core/commands.ts:629-648`.
- `upsertChange()` currently assigns `currentChange`, which is unsafe for passive non-active sync: `src/core/state.ts:122-125`.
- Checkpoint currently parses tasks before deciding whether the checkpoint is phase- or task-scoped and stages only explicit files: `src/core/commands.ts:677-711`.
- OMP status currently displays raw cached state without shared sync: `src/runtime/omp/status.ts:14-18`.
- Validators already parse task blocks and report duplicate/lacking-task-shape issues, but do not compare task artifacts to cached state: `src/core/validators.ts:101-183`.

## Implementation approach

1. Move task artifact parsing and safe reconciliation into shared core helpers. The helper returns both updated change state and explicit drift diagnostics so command paths can auto-sync safe drift and validators can report unsafe drift.
2. Add a state update path that writes one change without changing `currentChange`. Keep `upsertChange()` for flows such as `new`, `execute`, and deliberate current-change transitions.
3. Run safe sync before state-dependent CLI behavior: `status`, `tasks`, `execute`, `verify`, `handoff`, and task-aware checkpoint handling.
4. Split checkpoint behavior:
   - `--phase` checkpoints avoid task parsing/state writes.
   - `--task` checkpoints sync as needed to validate the task ID and stage `.specwright/state.json` if sync mutates it.
5. Update OMP status refresh to use the same shared sync/status read path as CLI status.
6. Extend validators with a specific unreconciled-drift issue code for malformed, duplicate, missing, or cache/artifact mismatch cases that cannot be safely auto-synced.
7. Add focused tests around safe checkbox/title sync, preservation of `in-progress` and `blocked`, non-active change sync, phase checkpoint no-write behavior, task checkpoint derived-state staging, OMP refresh, and validator drift reporting.

## Dependency waves

### Wave 1: Shared state foundation

Build the reusable parser/sync primitive and non-current-changing state write helper first. These are prerequisites for every command and OMP change.

### Wave 2: CLI behavior and checkpoint safety

Wire shared sync into CLI commands, then fix checkpoint sequencing and staging rules. Checkpoint work depends on Wave 1 because it needs to detect whether derived state changed.

### Wave 3: OMP and validation surfaces

Update OMP status to consume the shared path and add validator coverage for unreconciled drift. Validator work can proceed after the shared parser exists and is independent from checkpoint implementation.

## Risks

- Over-syncing can erase runtime-only `in-progress` or `blocked` state; preserve those states for unchecked tasks when ID/title still match.
- Passive sync using `upsertChange()` can silently switch the active change; use the new non-current-changing helper outside deliberate current-change flows.
- Checkpoint can dirty derived state as a side effect; phase checkpoints should avoid that path, and task checkpoints should include the derived mutation in the same commit.
