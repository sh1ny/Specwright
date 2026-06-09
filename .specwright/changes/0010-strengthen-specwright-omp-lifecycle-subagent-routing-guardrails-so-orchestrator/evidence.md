# Evidence

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local evidence

- `src/core/prompts.ts:12-30` shows `renderLifecycleSpawnStrategy()` currently includes: "If the `task` tool, `<agentName>`, or model `<model>` is unavailable, do the work directly in this agent with the same rules instead of blocking." This broad fallback is the exact text the settled decisions require removing.
- `src/core/commands.ts:696-758`, `:761-...`, `:893-...`, and `:933-...` (research/plan/execute/verify) all include `${renderLifecycleSpawnStrategy({ step: ..., config })}`, confirming a single helper change reaches every routed lifecycle phase.
- `src/runtime/omp/extension.ts:18-20` (`pi.sendUserMessage(result.prompt)`) plus `src/runtime/omp/types.ts:1-16` proves the extension boundary is plain user messages; guardrails must be prompt-based because there is no direct extension-managed dispatch API.
- `src/runtime/omp/install.ts:125-137` and `:39-123` prove generated agents carry `model: <configured>` and `spawns: []`, preserving the change 0008 frontmatter contract and the no-recursive-spawning non-goal.
- `src/core/state.ts:22-25` captures default agent models: `researcher: pi/task`, `planner: pi/plan`, `executor: pi/task`, `verifier: pi/task`.
- `test/core-prompts.test.ts:8-30` captures the current test expectation for the broad fallback and will need to be updated to assert the new orchestrator/fail-closed language.

## Research attempts

This research unit was performed by the assigned `specwright-researcher` agent without a preceding scout step. Local files were read via repository tools; no `web_search` was needed because the routing question is entirely local to Specwright's prompt and OMP extension source.

## Decisions supported

- Treat the receiving agent as a lifecycle orchestrator by adding explicit framing in the helper.
- Make subagent spawning the first operational action using helper ordering and imperative language.
- Name the exact target agent and configured model value; the helper already interpolates these and should keep emphasizing them.
- Fail closed on missing `task` tool, target subagent, or configured model by replacing the fallback with a blocker instruction.
- Forbid inline reads, edits, tests, artifact/status updates, and completion claims while the routed subagent is active.
- Keep the fallback policy hard-coded in prompt text with no config knob.

