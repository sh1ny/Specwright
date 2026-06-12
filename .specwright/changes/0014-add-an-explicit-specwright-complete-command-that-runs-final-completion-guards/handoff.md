# Agent Handoff: 0014

## Goal

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

## Read first

- .specwright/changes/0014-add-an-explicit-specwright-complete-command-that-runs-final-completion-guards/intent.md
- .specwright/changes/0014-add-an-explicit-specwright-complete-command-that-runs-final-completion-guards/evidence.md
- .specwright/changes/0014-add-an-explicit-specwright-complete-command-that-runs-final-completion-guards/tasks.md
- .specwright/changes/0014-add-an-explicit-specwright-complete-command-that-runs-final-completion-guards/verify.md

## Current state

status=verifying; step=verify

## Constraints

See intent.md and evidence.md.

## Acceptance

# Verification

## Result

PASS

## Issues

No issues.

## Observed output

```
$ bun test test/core-commands.test.ts -t "complete"
Test Results:
   PASS: 19 passed
```

```
$ bun test test/core-commands.test.ts -t "publish"
Test Results:
   PASS: 5 passed
```

```
$ bun test test/core-commands.test.ts -t "complete|publish"
Test Results:
   PASS: 24 passed
```

```
$ bun test test/core-validators.test.ts
Test Results:
   PASS: 7 passed
```

```
$ bun test test/core-commands.test.ts -t "verify preserves|complete"
Test Results:
   PASS: 20 passed
```

```
$ bun run typecheck
$ tsc --noEmit
```

```
$ specwright_validate(change="0014-add-an-explicit-specwright-complete-command-that-runs-final-completion-guards")
{
  "ok": true,
  "issues": []
}
```


## Next task

No incomplete tasks.

## Evidence

# Evidence

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local evidence

### Merge proposal

- `localdocs/MERGE-PROPOSAL.md:21-33` recommends adding `specwright complete [<change>] [--mode merge|push|pr|none]` and keeping merge behavior out of `verify`, `handoff`, `checkpoint`, and `publish`.
- `localdocs/MERGE-PROPOSAL.md:54-68` defines the four requested mode behaviors.
- `localdocs/MERGE-PROPOSAL.md:70-86` specifies the minimum local merge sequence and `git merge --no-ff <feature-branch>`.
- `localdocs/MERGE-PROPOSAL.md:88-105` lists fail-before-merge guardrails and says merge conflicts should leave normal Git conflict state with a clear failure.
- `localdocs/MERGE-PROPOSAL.md:107-123` recommends setting status `done`, step `handoff`, and avoiding a lifecycle schema migration for the first implementation.
- `localdocs/MERGE-PROPOSAL.md:139-142` and `localdocs/MERGE-PROPOSAL.md:174-180` make branch deletion a non-default/non-goal.

### Source seams

- `src/core/commands.ts:47-68` has `ParsedArgs.publishMode` and `PUBLISH_MODES`, but no complete mode field.
- `src/core/commands.ts:126-138` parses `--mode` as publish-specific only for `publish`; otherwise it treats values as Specwright document mode.
- `src/core/commands.ts:956-1001` keeps `verify` to validation/report/prompt work, which supports not hiding completion there.
- `src/core/commands.ts:1004-1022` keeps `handoff` to handoff generation and done-state bookkeeping, which supports not hiding merge there.
- `src/core/commands.ts:1093-1121` implements publish as no-op, push, or PR remote work only.
- `src/core/commands.ts:1151-1185` needs `complete` dispatch and help text.
- `src/core/git.ts:79-188` provides existing git/gh building blocks but lacks clean-worktree, existing-branch switch, pull, and no-fast-forward merge helpers.
- `src/core/state.ts:329-354` provides current/explicit change lookup and cached change updates.
- `src/core/types.ts:1-57` currently has lifecycle steps through `handoff` and `WorkflowPublishMode` without `merge`.
- `src/core/validators.ts:150-220` provides baseline validation and observed-output checks.
- `test/core-commands.test.ts:35-41` provides real temporary git repo setup.
- `test/core-commands.test.ts:1244-1350` covers publish none/push/pr behavior and can be mirrored for complete push/pr.

## Research attempts

1. Ran `specwright research` and `specwright research --print-prompt` for change 0014.
2. Delegated to `specwright-researcher` as required by the lifecycle prompt; it failed with `JSON error injected into SSE stream`.
3. Retried the same read-only assignment with the default `task` agent; it failed while yielding after reading local artifacts, `localdocs/MERGE-PROPOSAL.md`, and the relevant source/test seams.
4. Re-ran `specwright-researcher` after prompt steering reaffirmed lifecycle delegation; it again failed while yielding after reading and analyzing the same local evidence.
5. Completed bounded inline local research using the same required local evidence. No web research was needed.

## Decisions supported

- Add a new `complete` command instead of extending `publish`, `verify`, `handoff`, or `checkpoint`.
- Keep publish modes and complete modes as separate types/config surfaces.
- Run all guards before side effects.
- Reuse existing publish PR/body/push helpers for `complete --mode push` and `complete --mode pr`.
- Add focused git helpers for clean-worktree checks, base switching, optional base update, and `--no-ff` merge.
- Keep first implementation state at `status=done` and `step=handoff` after successful completion rather than adding a new lifecycle step.

