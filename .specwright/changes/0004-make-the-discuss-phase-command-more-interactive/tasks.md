# Tasks

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Wave 1 — Prompt renderer

- [x] T001: Add discuss prompt renderer

- Files:
  - `src/core/prompts.ts`
- Action:
  - Add `renderDiscussPrompt(...)` beside the existing prompt helpers.
  - Encode the decision-complete discuss workflow from `plan.md`: read discuss artifacts first, inspect bounded local evidence before asking, identify 3-4 change-specific gray areas, ask before writing artifacts, use Oh My Pi `ask` with `multi: true`, `recommended`, concise option descriptions, and grouped related `questions` where useful.
  - Include fallback guidance: use numbered plain text and wait for the user when `ask` is unavailable or freeform input is needed.
  - Include checkpoint guidance after each completed gray area, final artifact update timing, and the required ending: `Ready for research` or remaining load-bearing questions.
- Acceptance:
  - The renderer produces a prompt for the receiving OMP agent, not a deterministic CLI wizard.
  - The prompt names `discussion.md`, `intent.md`, `constraints.md`, and `decisions.md`.
  - The prompt does not require a new installed discusser agent or schema.
- Verification:
  - `bun test test/core-prompts.test.ts`

## Wave 2 — Command integration

- [x] T002: Wire discuss command to renderer

- Files:
  - `src/core/commands.ts`
  - `src/core/prompts.ts`
- Action:
  - Replace the current inline/static `commandDiscuss` prompt body with a call to `renderDiscussPrompt(...)`.
  - Keep existing state updates and artifact creation behavior unchanged for `discussion.md`, `intent.md`, `constraints.md`, and `decisions.md`.
  - Keep the frozen-after-approval behavior in `intent.md` intact.
- Acceptance:
  - `/specwright discuss` still returns one generated OMP-agent prompt.
  - `/specwright discuss` still creates or preserves the same discuss artifacts as before.
  - No stdin wizard or installed discusser agent is introduced.
- Verification:
  - `bun test test/core-commands.test.ts`

## Wave 3 — Core regression tests

- [x] T003: Cover core discuss prompt behavior

- Files:
  - `test/core-prompts.test.ts`
  - `test/core-commands.test.ts`
- Action:
  - Add focused assertions for `renderDiscussPrompt(...)` and/or `/specwright discuss`.
  - Assert load-bearing clauses only: ask-before-write, bounded local evidence, 3-4 gray areas, Oh My Pi `ask`, `multi: true`, `recommended`, concise option descriptions, grouped `questions`, plain-text fallback that waits for the user, checkpoints, final artifact update timing, and the required ending.
  - Preserve the existing `decisions.md` creation assertion.
- Acceptance:
  - Tests fail if the discuss prompt regresses to static non-interactive guidance.
  - Tests fail if the prompt implies the CLI itself can call `ask`.
  - Tests avoid complete-prompt or formatting-only assertions.
- Verification:
  - `bun test test/core-prompts.test.ts test/core-commands.test.ts`

## Wave 4 — OMP delivery regression

- [ ] T004: Cover OMP discuss delivery

- Files:
  - `test/omp-extension.test.ts`
- Action:
  - Add an OMP regression test that invokes `/specwright discuss` through the extension handler.
  - Assert it waits for idle, sends exactly one generated prompt through `sendUserMessage`, starts with `# Specwright Discuss:`, includes the ask-before-write contract, and includes the discuss artifact paths.
  - Preserve current no-options delivery behavior.
  - Do not add installer expectations for a new `specwright-discusser.md` card.
- Acceptance:
  - OMP `/specwright discuss` delivers the improved prompt through the existing generated-prompt path.
  - Existing install assertions for researcher, planner, executor, and verifier cards remain unchanged.
- Verification:
  - `bun test test/omp-extension.test.ts`