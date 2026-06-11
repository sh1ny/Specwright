# Tasks

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Wave 1 — Independent plumbing

- [ ] T001: Require checkpoint summaries at the CLI boundary
  - Files: `src/core/commands.ts`, `test/core-commands.test.ts`
  - Action: Add `summary?: string` to parsed args, parse `--summary <value>`, validate a non-empty trimmed summary in `commandCheckpoint`, and update checkpoint/commit help usage and examples with quoted summaries.
  - Acceptance: `checkpoint` and `commit` reject missing or blank `--summary`; existing `--phase`/`--task`, `--files`, and alias routing behavior remains unchanged.
  - Verification: Run focused core command tests covering missing summary, blank summary, and quoted summaries with spaces.

- [ ] T002: Add optional commit body support
  - Files: `src/core/git.ts`, all current `commitStaged` call sites found by scoped reference search
  - Action: Extend `commitStaged` to accept an optional body and pass a second `-m` argument only when the body is non-empty; migrate callers without compatibility shims.
  - Acceptance: Existing callers that pass only a subject keep the same git argument shape; checkpoint code can pass subject plus structured body.
  - Verification: Run focused tests that exercise existing non-checkpoint commit behavior and the new subject/body argument construction.

## Wave 2 — Checkpoint message behavior

- [ ] T003: Build checkpoint subject and metadata body
  - Files: `src/core/commands.ts`, `test/core-commands.test.ts`
  - Action: Replace the old checkpoint message with `[<change-id>-<unit-id>] <summary>` and construct the structured body containing change slug, unit kind/id, summary, task title for task checkpoints when available, phase for phase checkpoints, and scoped files.
  - Acceptance: Task checkpoints produce subjects like `[0013-T001] Implement checkpoint summary support`; phase checkpoints use the phase name as the unit id; bodies contain the required metadata; staging and `.specwright/state.json` sync behavior is unchanged.
  - Verification: Run focused checkpoint tests for task metadata, phase metadata, scoped files, and state-sync preservation.

- [ ] T004: Preserve commit alias parity
  - Files: `src/core/commands.ts`, `test/core-commands.test.ts`
  - Action: Ensure `specwright commit` continues routing through the same `commandCheckpoint` path and therefore requires `--summary` and emits the same subject/body format as `specwright checkpoint`.
  - Acceptance: The alias has no separate message logic and no divergent validation path.
  - Verification: Run a focused alias parity test comparing checkpoint and commit behavior for the same task summary.

## Wave 3 — Generated guidance

- [ ] T005: Update lifecycle checkpoint prompts
  - Files: `src/core/prompts.ts`, `test/core-prompts.test.ts`
  - Action: Update `renderCheckpointClause` so generated lifecycle instructions include `--summary "<concrete summary>"` and shell-quote summaries containing spaces.
  - Acceptance: Generated prompt text no longer shows checkpoint commands without `--summary`; examples are copy-paste safe for multi-word summaries.
  - Verification: Run focused prompt tests for checkpoint clause rendering.

## Wave 4 — Final focused verification

- [ ] T006: Verify the complete checkpoint cutover
  - Files: `src/core/commands.ts`, `src/core/git.ts`, `src/core/prompts.ts`, `test/core-commands.test.ts`, `test/core-prompts.test.ts`
  - Action: Run the targeted test files affected by the change and inspect failures for parser, message, alias, git-helper, help, or prompt drift.
  - Acceptance: All new and updated focused tests pass; no project-wide build, lint, format, or test command is used for this change.
  - Verification: Run only `bun test test/core-commands.test.ts` and `bun test test/core-prompts.test.ts` or narrower equivalent focused filters.

