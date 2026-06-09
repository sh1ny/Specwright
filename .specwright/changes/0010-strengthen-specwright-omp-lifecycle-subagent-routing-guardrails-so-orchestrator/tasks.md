# Tasks

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Wave 1 — Prompt guardrails

- [ ] T001: Rewrite lifecycle spawn strategy guardrails
  - Files: `src/core/prompts.ts`
  - Action: Replace the broad fallback in `renderLifecycleSpawnStrategy()` with lifecycle-orchestrator framing, imperative first-action spawning, inline-work prohibitions, and a visible blocker when the `task` tool, target Specwright subagent, or configured model is unavailable. Remove the sentence authorizing direct inline work.
  - Acceptance: The helper still interpolates the target subagent and configured model, names the receiver as orchestrator, makes subagent spawning the first operational action, forbids inline reads/edits/tests/artifact-status updates/completion claims while the subagent is active, and fails closed with a visible blocker instead of direct work.
  - Verification: Read `src/core/prompts.ts` and confirm the new text contains the orchestrator, first-action, inline-prohibition, and fail-closed blocker clauses and no longer contains `do the work directly in this agent with the same rules instead of blocking`.

- [ ] T002: Update lifecycle prompt tests
  - Files: `test/core-prompts.test.ts`
  - Action: Update the lifecycle spawn strategy test to remove old fallback expectations, add positive assertions for orchestrator framing, first-action delegation, inline-work prohibition, and visible blocker behavior, and add a negative assertion for the removed fallback sentence.
  - Acceptance: The focused prompt test verifies the new guardrail contract and prevents reintroducing the broad inline-work fallback.
  - Verification: Run `bun test test/core-prompts.test.ts` and confirm the prompt tests pass.