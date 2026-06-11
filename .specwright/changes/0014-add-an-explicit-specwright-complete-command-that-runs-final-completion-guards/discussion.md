# Discussion

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Conversation notes

- Source request asks for a new explicit `specwright complete` lifecycle command with modes `none`, `push`, `pr`, and `merge`.
- `complete` owns final lifecycle integration; merge behavior must not be hidden inside `verify`, `handoff`, `checkpoint`, or `publish`.
- Publish remains remote-only and currently supports `none`, `push`, and `pr`.
- Current branch for this change is `feature/0014-add-an-explicit-specwright-complete`, which reflects the existing 48-character branch-name truncation.

## Local evidence

- `src/core/commands.ts:1093-1121` implements `commandPublish` as remote-only work: `none` returns without remote work, `push` pushes the current branch, and `pr` pushes then creates a pull request.
- `src/core/commands.ts:956-1001` keeps `verify` focused on Specwright validators plus verify prompt generation.
- `src/core/commands.ts:1004-1022` keeps `handoff` focused on handoff generation and marking the change done when validation and task completion allow it.
- `src/core/git.ts:79-188` already has reusable primitives for worktree detection, current branch detection, branch push, PR creation, and base-branch resolution, but no no-fast-forward merge helper yet.
- `src/core/validators.ts:150-220` validates artifact/task structure and observed verification evidence, including missing tasks before execute and missing observed output once all tasks are checked.
- `src/core/types.ts:9` currently models `WorkflowPublishMode` as `"none" | "push" | "pr"`, so complete modes should be represented separately if `merge` must not become publish behavior.

## Open questions

1. What should be the default `complete` mode when `--mode` is omitted: always `none`, reuse `workflow.publishMode`, or add a separate `workflow.completeMode`?
2. Should `complete --mode pr` fail if a PR for the branch already exists, or detect and report the existing PR without creating a duplicate?
3. For `complete --mode merge`, should the base branch be updated from the remote before merging, or should it merge into the local resolved base exactly as checked out?
4. Which final artifacts are mandatory for complete beyond existing validators: `verify.md` and `handoff.md` only, or also non-empty `plan.md`, `tasks.md`, `evidence.md`, and `decisions.md`?

## Settled decisions

- Add a first-class `specwright complete` command rather than extending `verify`, `handoff`, `checkpoint`, or `publish`.
- Keep `publish` remote-only; `merge` belongs only to `complete`.
- Support complete modes `none`, `push`, `pr`, and `merge`.
- Run final guards before side effects for worktree state, branch state, validation, task completion, artifacts, verification evidence, branch/change mismatch, and base resolution.
