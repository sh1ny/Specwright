# Discussion

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Conversation notes

- Problem observed by user: when the lifecycle prompt is received by a weaker or more impulsive model such as `kimi-2.6`, it may begin implementing the task directly instead of spawning the configured Specwright subagent.
- Local comparison with GSD-core showed the important pattern is not a runtime enforcement hook. GSD mostly relies on stricter orchestration language: name the current agent as an orchestrator, forbid inline role absorption when the subagent tool exists, require waiting for the subagent result, and fail closed for phases where role separation is required.
- Specwright currently has a weaker `renderLifecycleSpawnStrategy()` helper: it tells the agent to use the `task` tool, but it also broadly says to do the work directly if the task tool, target agent, or model is unavailable.
- That fallback is useful for resilience but too broad for execute prompts because it authorizes exactly the bad behavior: inline implementation by the orchestrator.

## Open questions

- None remaining for discuss. The routed lifecycle policy is now settled for research, plan, execute, and verify.

## Discussion checkpoints

- Fallback phases — Question: which routed lifecycle phases must fail closed instead of doing work inline when `task`, target agent, or model routing is unavailable? Settled answer: all routed phases (`research`, `plan`, `execute`, and `verify`) fail closed. Source evidence: `src/core/prompts.ts:12-25` shows one shared `renderLifecycleSpawnStrategy()` helper with the broad inline fallback; `src/core/commands.ts:710,751,909,954` routes research, plan, execute, and verify through that helper.
- Config surface — Question: should fallback policy be configurable in this change? Settled answer: hard-code the prompt policy. Source evidence: `src/core/prompts.ts:12-25` is the narrow central edit point; `test/core-prompts.test.ts:9-30` already tests the current helper text.
- Routing failure behavior — Question: what should the receiving OMP agent do when routing is unavailable for a fail-closed phase? Settled answer: stop with a visible blocker naming the missing `task` tool, target agent, or configured model; do not ask the user to switch agents or continue inline. Source evidence: `src/core/prompts.ts:19-25` currently authorizes direct inline work, which is the behavior being removed.
- Orchestrator self-prohibitions — Question: which self-prohibitions should be included while the routed subagent is active? Settled answer: full no-touch list — no implementation file reading, code/artifact edits, test runs, artifact/status updates, or completion claims until the subagent result is received. Source evidence: `decisions.md:10-12` already requires full prompt handoff, no work/status updates while active, and waiting for the subagent result.

## Settled decisions

- Keep prompt-based OMP routing for this change.
- Adapt the guardrail pattern to Specwright's lifecycle prompts; do not import GSD prompt text.
- Research, plan, execute, and verify should fail closed when routing is unavailable unless a future prompt explicitly permits direct fallback.
- Preserve generated OMP agent frontmatter with configured `model` and `spawns: []`.