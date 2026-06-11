# Sources

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## URLs

No external sources were needed for `online=auto`.

Reason: the requested change is fully constrained by local Specwright artifacts and source code. It changes Specwright's own checkpoint commit message construction, parser surface, prompt text, and tests. No external API, dependency behavior, standard, competitor behavior, or recent upstream behavior materially affects the design.

## Local references

| File | Symbols / sections | Summary |
|------|--------------------|---------|
| `.specwright/changes/0013-improve-checkpoint-commit-messages-so-git-history-shows-change-task-and/constraints.md` | acceptance constraints | Defines required subject shape `[<change-id>-<unit-id>] <summary>` and structured checkpoint metadata expectations. |
| `src/core/commands.ts` | `ParsedArgs`, `parseArgs`, `commandCheckpoint`, `runSpecwrightCommand`, `renderHelp` | Owns CLI parsing, checkpoint/commit alias dispatch, current message construction, and help text. |
| `src/core/git.ts` | `commitStaged` | Shared git commit helper currently accepts only one message string. |
| `src/core/prompts.ts` | `renderCheckpointClause` | Generates checkpoint instructions for lifecycle prompts; must include `--summary`. |
| `src/core/types.ts` | `ChangeState`, `TaskState` | Provides change/task IDs, titles, slug, and task lookup data for commit body metadata. |
| `test/core-commands.test.ts` | core command tests | Existing test suite has no checkpoint-specific assertions; implementation needs new focused coverage. |
