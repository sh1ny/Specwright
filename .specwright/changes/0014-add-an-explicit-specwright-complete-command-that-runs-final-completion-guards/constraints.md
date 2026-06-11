# Constraints

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Product constraints

- `complete` must be explicit and separate from `publish`.
- `publish` remains remote-only and must not gain merge behavior.
- `none` runs final guards only.
- `push` pushes the current feature branch after guards pass.
- `pr` pushes the current feature branch and opens a PR after guards pass.
- `merge` switches to the resolved base branch and merges the feature branch using a no-fast-forward merge commit after guards pass.
- Branches must not be deleted by default.

## Technical constraints

- Fail before side effects when not in a git worktree, on detached HEAD, on the base branch, or with a dirty worktree.
- Fail before side effects when Specwright validation fails, tasks are missing or incomplete, required final artifacts are missing, or observed verification evidence is missing.
- Fail before side effects when the current branch does not match the current change.
- Fail before side effects when the base branch cannot resolve.
- For merge mode, report merge conflicts as failures and do not hide the merge attempt in another lifecycle command.
- Reuse existing git/gh runner patterns that pass command arguments as arrays.

## Open constraints

- Default mode when `--mode` is omitted is not settled.
- Existing PR handling for `complete --mode pr` is not settled.
- Whether merge mode should update the local base branch from remote first is not settled.
- Exact mandatory final artifact set beyond existing validators is not settled.
