# Agent Handoff: 0013

## Goal

Improve `specwright checkpoint` / `specwright commit` git history so checkpoint subjects show the change id, task or phase unit, and a concrete summary.

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

- Core checkpoint commits require a non-empty `--summary`.
- Commit subjects use `[<change-id>-<unit-id>] <summary>`.
- Commit bodies use the approved metadata format: `Change:`, `Unit:`, `Summary:`, optional `Task title:` / `Phase:`, and multiline `Files:` bullets.
- The OMP `specwright_checkpoint` tool accepts and forwards `summary`.
- Prompt/help checkpoint examples use single-quoted summary placeholders.
- Change metadata title is restored to the full request text.
- Focused modified-file tests, typecheck, and Specwright validation pass; see `verify.md`.

## Constraints

- Do not rewrite existing checkpoint commits.
- Do not change checkpoint staging semantics or `.specwright/state.json` synchronization behavior.
- Keep `specwright checkpoint` and `specwright commit` alias behavior identical.

## Acceptance

- Missing or blank checkpoint summaries fail before git commit.
- Task and phase checkpoint commits include the expected subject and body metadata.
- OMP checkpoint tool schema and argv forwarding include `summary`.
- Lifecycle prompts and CLI help show the required summary argument.
- Focused command, prompt, OMP extension, and typecheck verification pass.

## Next task

No incomplete implementation tasks remain.
