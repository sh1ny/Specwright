# Evidence

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local evidence

### Current commit message construction

**File:** `src/core/commands.ts` (`commandCheckpoint`)

`commandCheckpoint` currently constructs the commit message as:

```ts
const unit = args.task ?? args.phase ?? "";
const message = `specwright: checkpoint ${change.id}-${change.slug} ${unit}`;
```

Observed problems:
1. Long change slugs dominate `git log --oneline`.
2. No human-supplied summary appears in the subject.
3. The unit is only the raw `--phase` or `--task` value.
4. No commit body carries structured metadata.

### Checkpoint command signature

**File:** `src/core/commands.ts` (`commandCheckpoint`, `ParsedArgs`, `parseArgs`)

`commandCheckpoint` accepts `args.phase` or `args.task` and `args.files`. `ParsedArgs` has no `summary` field and `parseArgs` has no `--summary` branch.

### Git commit helper

**File:** `src/core/git.ts` (`commitStaged`)

`commitStaged` currently passes only one `-m <message>` argument to `git commit`. It has no explicit body parameter. To support a structured body cleanly, the helper can accept an optional body and pass multiple `-m` flags.

### Prompt and help surfaces

**Files:**
- `src/core/prompts.ts` (`renderCheckpointClause`)
- `src/core/commands.ts` (`renderHelp`)

`renderCheckpointClause` does not instruct agents to pass `--summary`. Help text documents `specwright checkpoint [<change>] (--phase ... | --task T###) --files <file[,file...]>` without `--summary`.

If `--summary` is required, prompt/help examples must show shell quoting for summaries with spaces, e.g. `--summary "Implement checkpoint summary support"`.

### Available state data

**Files:**
- `src/core/types.ts` (`ChangeState`)
- `src/core/types.ts` (`TaskState`)

`ChangeState` provides `id`, `slug`, `title`, and `tasks`. `TaskState` provides `id`, `title`, `status`, and `updatedAt`. Task checkpoints can include `change.tasks[taskId]?.title` in the commit body.

### Command aliases

**File:** `src/core/commands.ts` (`runSpecwrightCommand`)

Both `checkpoint` and `commit` route to `commandCheckpoint`, so changing `commandCheckpoint` gives both aliases identical message behavior.

### Existing tests

**File:** `test/core-commands.test.ts`

Existing checkpoint coverage asserted the old deterministic subjects and scoped staging behavior, but it did not cover the new `--summary` requirement or structured commit body behavior. The implementation phase needs focused tests for:
- missing `--summary` validation,
- subject format `[<change-id>-<unit-id>] <summary>`,
- body metadata for phase checkpoints,
- body metadata for task checkpoints,
- `commit` alias parity with `checkpoint`,
- quoted summary parsing for summaries with spaces.

## Research attempts

1. Primary local exploration succeeded. The researcher read the relevant source/test files: `src/core/commands.ts`, `src/core/git.ts`, `src/core/types.ts`, `src/core/prompts.ts`, and `test/core-commands.test.ts`.
2. No scout fallback was needed; the primary researcher returned usable local evidence.
3. No web search was needed because `online=auto` and this change is constrained by local Specwright command behavior and local constraints.

## Decisions supported

- Replace message construction in `commandCheckpoint`.
- Add `summary?: string` to `ParsedArgs` and parse `--summary <value>`.
- Require non-empty `--summary` for `checkpoint`/`commit`.
- Prefer extending `commitStaged` with an optional commit body parameter rather than embedding subject and body as one opaque string.
- Update `renderCheckpointClause` and `renderHelp` atomically so generated agent instructions and CLI help match parser behavior.
- Add focused command tests because no checkpoint coverage exists today.
