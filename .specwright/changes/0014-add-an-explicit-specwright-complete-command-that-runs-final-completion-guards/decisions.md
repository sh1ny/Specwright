# Decisions

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Settled

- Add `specwright complete` as a distinct lifecycle command for finished changes.
- Supported complete modes are `none`, `push`, `pr`, and `merge`.
- `publish` remains remote-only; merge behavior is owned by `complete`.
- `complete --mode none` runs final guards without side effects and is the default when `--mode` is omitted.
- `complete --mode push` pushes the current feature branch only after guards pass.
- `complete --mode pr` pushes the branch and opens a PR via `gh pr create` only after guards pass; existing/duplicate PR behavior is delegated to `gh`.
- `complete --mode merge` switches to the resolved base branch and performs a no-fast-forward merge commit only after guards pass; it does not fetch or update the base branch first.
- Fail closed before side effects for invalid git state, detached HEAD, dirty worktree, validation failure, missing or incomplete tasks, missing artifacts/evidence, branch/change mismatch, and unresolved base.
- `verify.md` must contain observed command/output evidence, not just arbitrary prose.
- Task sync drift detected while loading `tasks.md` fails the command before the synced change is used.

## Deferred

- None remaining for this change.

## Ready state

Discuss artifacts capture the source request, local evidence, settled constraints, and remaining load-bearing questions. Research can investigate existing command/test seams before planning.
