# Research

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local findings

### Current behavior

`commandCheckpoint` in `src/core/commands.ts` builds checkpoint commit subjects as:

```text
specwright: checkpoint <change-id>-<change-slug> <unit>
```

Example:

```text
specwright: checkpoint 0013-improve-checkpoint-commit-messages-so-git-history-shows-change-task-and research
```

This is noisy in `git log --oneline`, omits the reason for the checkpoint, and carries no structured body metadata.

Both `specwright checkpoint` and `specwright commit` route through `commandCheckpoint`, so one implementation path controls both aliases.

### Target behavior

From local constraints, checkpoint commits should use:

```text
[<change-id>-<unit-id>] <summary>
```

Example:

```text
[0013-T001] Implement checkpoint summary support
```

Recommended body shape:

```text
Change: <change-id>-<change-slug>
Unit: <task|phase> <unit-id>
Summary: <summary>
Task title: <task-title>   # only for task checkpoints
Phase: <phase-name>        # only for phase checkpoints
Files:
- <file1>
- <file2>
```

`--summary` should be explicit and required. It should not be silently derived from `change.title` or `task.title`, because the subject needs the human-intended checkpoint summary, not just the task/change label. The task/change title can still appear in the body as context.

### Required code surfaces

- `src/core/commands.ts`
  - Add `summary?: string` to `ParsedArgs`.
  - Parse `--summary <value>` in `parseArgs`.
  - Validate non-empty `--summary` in `commandCheckpoint`.
  - Replace current message construction with subject/body construction.
  - Keep `checkpoint` and `commit` alias behavior identical via shared `commandCheckpoint`.
  - Update `renderHelp` with `--summary <summary>` and quote examples for summaries with spaces.
- `src/core/git.ts`
  - Extend `commitStaged` to accept an optional body and pass multiple `-m` flags.
- `src/core/prompts.ts`
  - Update `renderCheckpointClause` so lifecycle checkpoint instructions include `--summary "<concrete summary>"`.
- `test/core-commands.test.ts`
  - Add focused checkpoint tests; no checkpoint-specific coverage exists today.

### Available data for message construction

- `change.id` — change number, e.g. `0013`.
- `change.slug` — full change slug.
- `change.title` — change title for body context if useful.
- `args.task` — task unit, e.g. `T001`.
- `args.phase` — phase unit, e.g. `research`.
- `args.files` — scoped checkpoint files.
- `args.summary` — new required human summary.
- `change.tasks[args.task]?.title` — task title for task checkpoint body metadata.

### Backward compatibility

`--summary` is a new required flag. No parser support exists today, so implementation must update parser, prompt generation, help, and tests in one cutover. Do not add a compatibility shim that fabricates summaries from titles; that would preserve the current vague commit history problem.

Existing commits are historical records and should not be rewritten or migrated.

## External findings

No external research was needed. This change is fully specified by local constraints and local source behavior.

## Implications

1. Lifecycle prompts that emit checkpoint commands must include quoted `--summary` values, e.g. `--summary "Research checkpoint message options"`.
2. Implementation needs focused checkpoint command coverage because existing core command tests do not assert checkpoint behavior.
3. Extending `commitStaged` is the cleanest way to support a structured commit body. Before changing its signature, use LSP references or scoped search to find every caller and update in one clean cutover with no overload shim.
4. Validation must preserve existing checkpoint invariants: exactly one of `--phase`/`--task`, scoped `--files`, task sync behavior, and current staging of requested files/state mutations.
