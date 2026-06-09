# Constraints

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Product constraints

- Models only update workflow artifacts for task progress; they are not required to edit `.specwright/state.json`.
- OMP-visible status must not remain stale after session refresh when `tasks.md` has changed.
- Normal user-facing commands should auto-sync safe drift instead of making users manually repair cache state.

## Technical constraints

- `tasks.md` is authoritative for task IDs, task titles, and checked/done completion.
- Safe sync preserves cached `in-progress` and `blocked` states for unchecked tasks when the task ID and title still match.
- Checked tasks in `tasks.md` become cached `done` tasks.
- Sync must run before state-dependent `status`, `tasks`, `execute`, `verify`, and `handoff` behavior.
- OMP status refresh must use shared core sync/status behavior rather than displaying raw stale cache.
- Passive sync of a non-active change must not mutate `currentChange`; existing `upsertChange()` behavior is unsafe for that path because it makes the updated change current.
- Validators should report unreconciled drift with a specific issue code when sync cannot safely reconcile malformed or ambiguous task state.
- Checkpoint must not require users to list `.specwright/state.json` manually when checkpoint itself mutates derived state during sync.
- Phase checkpoints should avoid task parsing/state writes unless task metadata is required; task checkpoints may sync but must include any resulting derived state mutation in the commit.

## Open constraints

None after discussion checkpoint.
