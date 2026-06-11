# Agent Handoff: 0013

## Goal

Improve `specwright checkpoint` / `specwright commit` git history so checkpoint subjects show the change id, task or phase unit, and a concrete summary.

## Closure note

Feature branch 0013 was already merged into `main` before this bookkeeping closure; no publish, PR creation, or merge-back was performed here.

## Read first

- `.specwright/changes/0013-improve-checkpoint-commit-messages-so-git-history-shows-change-task-and/intent.md`
- `.specwright/changes/0013-improve-checkpoint-commit-messages-so-git-history-shows-change-task-and/plan.md`
- `.specwright/changes/0013-improve-checkpoint-commit-messages-so-git-history-shows-change-task-and/tasks.md`
- `.specwright/changes/0013-improve-checkpoint-commit-messages-so-git-history-shows-change-task-and/verify.md`
- `src/core/commands.ts`
- `src/core/git.ts`
- `src/core/prompts.ts`
- `src/runtime/omp/extension.ts`
- `test/core-commands.test.ts`
- `test/core-prompts.test.ts`
- `test/omp-extension.test.ts`

## Current state

- status=done; step=handoff
- Core checkpoint commits require a non-empty `--summary`.
- Commit subjects use `[<change-id>-<unit-id>] <summary>`.
- Commit bodies use the approved metadata format: `Change:`, `Unit:`, `Summary:`, optional `Task title:` / `Phase:`, and multiline `Files:` bullets.
- The OMP `specwright_checkpoint` tool accepts and forwards `summary`.
- Prompt/help checkpoint examples use single-quoted summary placeholders.
- All tasks in `tasks.md` are complete.
- Change 0013 is parked as complete on `main`.

## Constraints

- Do not rewrite existing checkpoint commits.
- Do not change checkpoint staging semantics or `.specwright/state.json` synchronization behavior.
- Keep `specwright checkpoint` and `specwright commit` alias behavior identical.
- Do not run publish, create a PR, merge branches, or fabricate branch-integration evidence for this already-merged change.

## Acceptance

- Missing or blank checkpoint summaries fail before git commit.
- Task and phase checkpoint commits include the expected subject and body metadata.
- OMP checkpoint tool schema and argv forwarding include `summary`.
- Lifecycle prompts and CLI help show the required summary argument.
- Bookkeeping closure from `main` records the change as done and leaves an honest handoff.

## Next task

No incomplete implementation or closure tasks remain.
