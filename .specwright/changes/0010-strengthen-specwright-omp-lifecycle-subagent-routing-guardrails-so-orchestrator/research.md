# Research

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local findings

- `src/core/prompts.ts:12-30` defines the single shared helper `renderLifecycleSpawnStrategy()` that maps `research`, `plan`, `execute`, and `verify` to `specwright-researcher`, `specwright-planner`, `specwright-executor`, and `specwright-verifier` and interpolates the configured model from `config.agents[<step>]`. The current text includes a broad fallback that authorizes the receiving agent to "do the work directly in this agent" when the `task` tool, target agent, or configured model is unavailable. This is the language weaker models can use to absorb worker roles inline.
- `src/core/commands.ts:696-758` (`commandResearch`), `:761-...` (`commandPlan`), `:893-...` (`commandExecute`), and `:933-...` (`commandVerify`) each include `${renderLifecycleSpawnStrategy({ step: ..., config })}` in their assembled prompt. Changing the helper therefore updates all four routed phases consistently.
- `src/runtime/omp/extension.ts:1-25` confirms the extension boundary: the Specwright CLI produces a prompt string, and the extension delivers it via `pi.sendUserMessage(result.prompt)`. There is no extension-managed subagent dispatch API; routing must be expressed entirely in prompt text.
- `src/runtime/omp/types.ts:1-16` defines `ExtensionApiLike` with `sendUserMessage`, `registerCommand`, events, and logging, but no `task` or `spawn` endpoint. OMP's `task` tool is a model-side capability, which is why the receiving agent must be told explicitly when and how to use it.
- `src/runtime/omp/install.ts:125-137` renders generated agent frontmatter as `model: ${model}` and `spawns: []`. The four `AGENT_DEFINITIONS` (`:39-123`) preserve `spawns: []`, satisfying the non-goal of no recursive lifecycle spawning and preserving the change 0008 frontmatter contract.
- `src/core/state.ts:22-25` defines default agent models: `researcher: pi/task`, `planner: pi/plan`, `executor: pi/task`, `verifier: pi/task`. These are the values that will appear in the routing prompt unless overridden.
- `test/core-prompts.test.ts:8-30` currently asserts the presence of the broad fallback sentence ("do the work directly in this agent"). Any prompt change that removes or rewords that fallback must update this test and should add positive assertions for orchestrator language and the fail-closed blocker.

## External findings

None required. The routing mechanism is entirely local: an OMP extension sends a plain user message and relies on the receiving model's `task` tool. The local source enumerates the `ExtensionApiLike` surface, agent generation, and prompt assembly completely. No dependency version, external standard, or competitor behavior affects the decision, so no web search was performed.

## Implications

- The smallest correct change is a prompt-only rewrite of `renderLifecycleSpawnStrategy()` in `src/core/prompts.ts`.
- The same text change automatically applies to `research`, `plan`, `execute`, and `verify` because they share the helper.
- Prompt tests in `test/core-prompts.test.ts` need updates to match the new strict language and to ensure the old fallback language is gone.
- No code changes are needed in `install.ts`, `extension.ts`, or `commands.ts` unless a phase-specific option is chosen.
- Because the helper is shared, the wording must be generic enough for all four phases while still forbidding inline work.

