# Intent

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">
## Goal

Add an explicit `specwright complete` command that runs final completion guards for a finished change and supports modes `none`, `push`, `pr`, and `merge`.

## Users

- Maintainers finishing Specwright-managed feature branches who need one explicit command for final guards and optional lifecycle integration.
- Agents that must fail closed before remote pushes, PR creation, or base-branch merge side effects.
- Reviewers reading git history who need merge behavior to be explicit rather than hidden inside verify, handoff, checkpoint, or publish.

## Non-goals

- Do not implement branch deletion by default.
- Do not move merge behavior into `verify`, `handoff`, `checkpoint`, or `publish`.
- Do not change `publish` into a merge-capable command; publish remains remote-only.
- Do not implement code during the discuss phase.
</frozen-after-approval>

## Approval notes
### Source request
Add an explicit specwright complete command that runs final completion guards for a finished change and supports modes none, push, pr, and merge. Publish remains remote-only. Complete owns lifecycle integration: none runs guards only; push pushes the current feature branch; pr pushes and opens a PR; merge switches to the resolved base branch and merges the feature branch using a no-fast-forward merge commit. It must fail before side effects when not in a git worktree, detached HEAD, on the base branch, dirty worktree, validation fails, tasks are missing or not done, final artifacts or observed verification evidence are missing, branch/change mismatch is detected, base cannot resolve, or merge conflicts occur. Do not delete branches by default and do not hide merge behavior in verify, handoff, checkpoint, or publish.
### Expanded request
Add an explicit specwright complete command that runs final completion guards for a finished change and supports modes none, push, pr, and merge. Publish remains remote-only. Complete owns lifecycle integration: none runs guards only; push pushes the current feature branch; pr pushes and opens a PR; merge switches to the resolved base branch and merges the feature branch using a no-fast-forward merge commit. It must fail before side effects when not in a git worktree, detached HEAD, on the base branch, dirty worktree, validation fails, tasks are missing or not done, final artifacts or observed verification evidence are missing, branch/change mismatch is detected, base cannot resolve, or merge conflicts occur. Do not delete branches by default and do not hide merge behavior in verify, handoff, checkpoint, or publish.