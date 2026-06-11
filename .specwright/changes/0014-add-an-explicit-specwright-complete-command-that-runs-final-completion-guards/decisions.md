# Decisions

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Settled

- Add `specwright complete` as a distinct lifecycle command for finished changes.
- Supported complete modes are `none`, `push`, `pr`, and `merge`.
- `publish` remains remote-only; merge behavior is owned by `complete`.
- `complete --mode none` runs final guards without side effects.
- `complete --mode push` pushes the current feature branch only after guards pass.
- `complete --mode pr` pushes the branch and opens a PR only after guards pass.
- `complete --mode merge` switches to the resolved base branch and performs a no-fast-forward merge commit only after guards pass.
- Fail closed before side effects for invalid git state, dirty worktree, validation failure, incomplete tasks, missing artifacts/evidence, branch/change mismatch, unresolved base, and merge conflicts.

## Deferred

- Default mode selection when `--mode` is omitted.
- Duplicate or existing PR behavior for `complete --mode pr`.
- Whether `complete --mode merge` should fetch/update the base branch before merging.
- The exact final artifact completeness policy beyond current validators.

## Ready state

Discuss artifacts capture the source request, local evidence, settled constraints, and remaining load-bearing questions. Research can investigate existing command/test seams before planning.
