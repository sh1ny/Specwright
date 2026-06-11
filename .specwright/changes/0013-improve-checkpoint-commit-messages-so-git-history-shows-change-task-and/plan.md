# Plan

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Decision

Implement a clean cutover for checkpoint commit messages. `specwright checkpoint` and the `specwright commit` alias will require `--summary <summary>` and will create commit subjects as `[<change-id>-<unit-id>] <summary>`, where `unit-id` is the task id for `--task` or the phase name for `--phase`. This directly fixes the current `specwright: checkpoint <change-slug> <unit>` subject that is noisy in `git log --oneline` and lacks a human summary (`.specwright/changes/0013-improve-checkpoint-commit-messages-so-git-history-shows-change-task-and/evidence.md`, "Current commit message construction").

`--summary` is explicit, required, and validated after trimming. The implementation must not derive it from the change title or task title, because the requested history needs a concrete checkpoint summary (`.specwright/changes/0013-improve-checkpoint-commit-messages-so-git-history-shows-change-task-and/evidence.md`, "Decisions supported"; `.specwright/changes/0013-improve-checkpoint-commit-messages-so-git-history-shows-change-task-and/constraints.md`, "Product constraints"). Existing commits are not rewritten (`.specwright/changes/0013-improve-checkpoint-commit-messages-so-git-history-shows-change-task-and/intent.md`, "Non-goals").

Commit bodies will be structured metadata, using one subject `-m` and one body `-m` via `commitStaged`:

```text
Change: <change-id>-<change-slug>
Unit: <task|phase> <unit-id>
Summary: <summary>
Task title: <task-title>   # task checkpoints only, when available
Phase: <phase-name>        # phase checkpoints only
Files:
- <file1>
- <file2>
```

The body will preserve the scoped file list from `args.files` and must not change existing checkpoint staging or `.specwright/state.json` synchronization behavior (`.specwright/changes/0013-improve-checkpoint-commit-messages-so-git-history-shows-change-task-and/evidence.md`, "Available state data" and "Required code surfaces"; `.specwright/changes/0013-improve-checkpoint-commit-messages-so-git-history-shows-change-task-and/constraints.md`, "Technical constraints").

## Implementation plan

1. Update CLI parsing and validation in `src/core/commands.ts`: add `summary?: string` to `ParsedArgs`, parse `--summary <value>`, require a non-empty trimmed value in `commandCheckpoint`, and update `renderHelp` usage/examples with quoted summaries. Keep existing `--phase`/`--task`, `--files`, and alias routing behavior intact (`.specwright/changes/0013-improve-checkpoint-commit-messages-so-git-history-shows-change-task-and/evidence.md`, "Checkpoint command signature", "Prompt and help surfaces", and "Command aliases").
2. Extend `src/core/git.ts` so `commitStaged` accepts an optional body and emits multiple `git commit -m` arguments only when a body is supplied. Update every caller in one cutover; do not add overload shims (`.specwright/changes/0013-improve-checkpoint-commit-messages-so-git-history-shows-change-task-and/evidence.md`, "Git commit helper"; `.specwright/changes/0013-improve-checkpoint-commit-messages-so-git-history-shows-change-task-and/research.md`, "Implications").
3. Replace checkpoint message construction in `commandCheckpoint` with a small, local subject/body construction path. Use `change.id`, `change.slug`, `args.task`, `args.phase`, `args.files`, `args.summary`, and `change.tasks[taskId]?.title` as documented (`.specwright/changes/0013-improve-checkpoint-commit-messages-so-git-history-shows-change-task-and/evidence.md`, "Available state data").
4. Update lifecycle prompt generation in `src/core/prompts.ts` so generated checkpoint instructions include `--summary "<concrete summary>"`, keeping prompts aligned with the required parser behavior (`.specwright/changes/0013-improve-checkpoint-commit-messages-so-git-history-shows-change-task-and/evidence.md`, "Prompt and help surfaces").
5. Add focused tests in `test/core-commands.test.ts` and update prompt tests as needed. Cover missing summary validation, quoted summary parsing, task and phase subject/body metadata, alias parity, and unchanged scoped-file/state behavior (`.specwright/changes/0013-improve-checkpoint-commit-messages-so-git-history-shows-change-task-and/evidence.md`, "Existing tests"). Use only targeted test files, not project-wide gates.

## Risks

- Parser/help/prompt drift would make generated agent commands fail once `--summary` is required. Mitigation: update all three in the same change and test help/prompt output where existing tests support it.
- Changing `commitStaged` can break non-checkpoint commits. Mitigation: find all callers during implementation, keep the body optional, and preserve the existing single-message behavior for callers that pass no body.
- Accidentally changing staging/state behavior would violate the non-goal. Mitigation: keep message construction separate from staging and add focused assertions around scoped files/state mutation.
- Task title metadata may be absent for malformed or stale task ids. Mitigation: include `Task title:` only when `change.tasks[taskId]?.title` exists; validation of task existence remains the existing command's responsibility.

