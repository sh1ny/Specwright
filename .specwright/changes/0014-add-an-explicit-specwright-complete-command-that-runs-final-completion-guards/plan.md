# Plan

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Decision

Add `specwright complete [<change>] [--mode none|push|pr|merge]` as a new explicit lifecycle command. Do not add merge behavior to `publish`, `verify`, `handoff`, or `checkpoint`; `publish` remains remote-only (`evidence.md` §Local evidence / Merge proposal, §Source seams).

Use a separate `WorkflowCompleteMode`/`COMPLETE_MODES` and `ParsedArgs.completeMode`. Do not widen `WorkflowPublishMode`; `publish --mode` remains `none|push|pr` (`evidence.md` §Source seams, §Decisions supported).

Default omitted `--mode` to `none`. This makes the explicit completion command fail closed: it runs all final guards and performs no git/remote side effects unless the caller chooses `push`, `pr`, or `merge`.

Before any side effect, `complete` must require: inside a git worktree; not detached HEAD; resolved current or explicit change; current branch equals `branchNameForChange(change)`; current branch is not the resolved base branch; worktree clean; base branch resolves; `validateChange` passes; `tasks.md` exists and every task is checked; final artifacts `verify.md` and `handoff.md` exist and are non-empty; observed verification evidence passes existing validator checks (`evidence.md` §Merge proposal, §Source seams).

Mode behavior:
- `none`: guards only; no remote work, branch switch, merge, branch deletion, or artifact generation.
- `push`: after guards, push the current feature branch with existing push helper.
- `pr`: after guards, push, then use the existing PR creation/body path. Existing-PR behavior stays identical to the current helper/`gh pr create` result; no new idempotency path in this change.
- `merge`: after guards, switch to the resolved existing local base branch and run `git merge --no-ff --no-edit <feature-branch>`. Do not pull/update base automatically. Merge conflicts are reported as command failures and normal Git conflict state is left for the user to resolve (`evidence.md` §Merge proposal, §Decisions supported).

Do not delete branches by default. Do not add a lifecycle schema migration or new completion step; successful completion relies on the existing final `done`/`handoff` lifecycle state and does not create missing final artifacts (`evidence.md` §Merge proposal, §Decisions supported).

## Implementation plan

Wave 1: add the command surface and git primitives independently. Wire parser/help/dispatch with a complete-specific mode, and add array-argument git helpers for clean status, existing-branch switch, and no-fast-forward merge (`evidence.md` §Source seams).

Wave 2: implement fail-before-side-effect guards. Keep guard evaluation read-only and ordered before push, PR, branch switch, merge, or state/artifact mutation.

Wave 3: add mode actions using existing push/PR helpers and new merge helpers. Keep `publish` unchanged.

Wave 4: add focused tests and README/help documentation for the new command, plus publish regression coverage.

## Risks

The highest risk is accidental side effects before a failing guard. Tests must assert no push, PR, branch switch, merge, or state/artifact mutation for dirty worktree, base-branch, branch mismatch, incomplete tasks, missing final artifacts, and missing observed evidence.

Merge conflicts necessarily occur after the merge attempt starts; the correct behavior is explicit failure with normal Git conflict state preserved, not rollback or branch deletion.

Skipping automatic base update avoids hidden network side effects but may merge into a stale local base. That tradeoff is intentional for this change and can be extended later with an explicit flag.
