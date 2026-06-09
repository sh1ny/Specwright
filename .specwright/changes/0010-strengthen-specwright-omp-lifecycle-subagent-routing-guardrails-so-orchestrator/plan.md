# Plan

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Decision

Replace the broad fallback in `renderLifecycleSpawnStrategy()` with strict orchestrator guardrails that make subagent spawning the first operational action and fail closed when routing prerequisites are missing.

**Why:** The current helper in `src/core/prompts.ts:12-30` tells the receiving agent to "do the work directly in this agent" if the `task` tool, target agent, or model is unavailable (`evidence.md`). This fallback is too permissive for weaker models such as `kimi-2.6`, which can absorb the worker role inline instead of delegating (`intent.md`). The extension boundary is plain user messages via `pi.sendUserMessage(result.prompt)` and `ExtensionApiLike` has no dispatch endpoint (`evidence.md`; `src/runtime/omp/extension.ts:18-20`; `src/runtime/omp/types.ts:1-16`), so the guardrails must be prompt text.

**What:**
1. Rewrite `renderLifecycleSpawnStrategy()` in `src/core/prompts.ts` to:
   - Frame the receiving agent as the lifecycle orchestrator for the current phase.
   - Make spawning the configured subagent the first operational action.
   - Forbid inline implementation-file reads, code/artifact edits, test runs, artifact/status updates, and completion claims while the routed subagent is active.
   - Replace the broad fallback with a visible blocker that names the missing `task` tool, target Specwright subagent, or configured model.
2. Update `test/core-prompts.test.ts` to assert the new orchestrator and blocker language, and to reject the old fallback sentence.

**What not:** Do not change `src/core/commands.ts`, `src/runtime/omp/extension.ts`, `src/runtime/omp/install.ts`, or `src/core/state.ts`. The helper is already shared by research, plan, execute, and verify (`evidence.md`; `src/core/commands.ts:696-758`, `:761-...`, `:893-...`, `:933-...`), generated agents already preserve `model: <configured>` and `spawns: []` (`evidence.md`; `src/runtime/omp/install.ts:39-137`), and fallback policy remains hard-coded with no config knob (`constraints.md`).

## Implementation plan

1. `src/core/prompts.ts`: Rewrite the returned lifecycle spawn strategy text. Keep target agent/model interpolation. Add orchestrator identity, imperative first-action language, inline-work prohibition, and fail-closed blocker wording. Remove `do the work directly in this agent with the same rules instead of blocking`.
2. `test/core-prompts.test.ts`: Update the focused lifecycle spawn strategy test. Replace positive assertions for the old fallback with positive assertions for orchestrator framing, first-action delegation, inline-work prohibition, and visible blocker naming the missing `task` tool, target agent, or configured model. Add a negative assertion for the removed fallback sentence.

## Dependency waves

- **Wave 1 — Prompt guardrails:** Rewrite the shared helper and update the focused prompt tests together. The work is a single dependency wave because the test change depends on the exact helper contract and no independent file group can land safely first.

## Risks

- **Prompt-only enforcement can still be ignored by a model.** This is the maximum available enforcement at the current OMP boundary because the extension sends only plain user messages (`evidence.md`).
- **Prompt tests can become brittle.** Assert load-bearing clauses and absence of the old fallback, not the full paragraph verbatim.
- **The blocker must not look like a CLI runtime error.** Phrase it as an agent instruction to stop and report the missing routing prerequisite.

