# Intent

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">
## Goal

## Users

## Non-goals

</frozen-after-approval>

## Approval notes
### Source request
Add an explicit specwright complete command that runs final completion guards for a finished change and supports modes none, push, pr, and merge. Publish remains remote-only. Complete owns lifecycle integration: none runs guards only; push pushes the current feature branch; pr pushes and opens a PR; merge switches to the resolved base branch and merges the feature branch using a no-fast-forward merge commit. It must fail before side effects when not in a git worktree, detached HEAD, on the base branch, dirty worktree, validation fails, tasks are missing or not done, final artifacts or observed verification evidence are missing, branch/change mismatch is detected, base cannot resolve, or merge conflicts occur. Do not delete branches by default and do not hide merge behavior in verify, handoff, checkpoint, or publish.
### Expanded request
Add an explicit specwright complete command that runs final completion guards for a finished change and supports modes none, push, pr, and merge. Publish remains remote-only. Complete owns lifecycle integration: none runs guards only; push pushes the current feature branch; pr pushes and opens a PR; merge switches to the resolved base branch and merges the feature branch using a no-fast-forward merge commit. It must fail before side effects when not in a git worktree, detached HEAD, on the base branch, dirty worktree, validation fails, tasks are missing or not done, final artifacts or observed verification evidence are missing, branch/change mismatch is detected, base cannot resolve, or merge conflicts occur. Do not delete branches by default and do not hide merge behavior in verify, handoff, checkpoint, or publish.