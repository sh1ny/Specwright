# Options

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Option 1 — Tighten the shared helper with strict orchestrator language

Rewrite `renderLifecycleSpawnStrategy()` in `src/core/prompts.ts` to frame the receiving agent as a lifecycle orchestrator, require spawning as the first action, add explicit prohibitions while the subagent is active, and replace the broad fallback with a fail-closed blocker.

Draft helper text:

```text
Lifecycle spawn strategy:
- You are the lifecycle orchestrator for this ${step} phase. Your first operational action must be to use OMP's `task` tool to spawn `${agentName}`.
- Route to configured model `${model}` from `agents.${agent}.model`.
- Pass the full current prompt as the subagent assignment, including read-first files, rules, acceptance, and checkpoint instructions.
- While `${agentName}` is active, do not read implementation files, edit code or artifacts, run tests, update tasks.md or status, or claim completion.
- Wait for the `${agentName}` result before editing artifacts, updating status, or reporting completion.
- If the `task` tool, `${agentName}`, or model `${model}` is unavailable, stop and report a visible blocker naming the missing item. Do not continue the ${step} work inline.
- Do not ask the user to switch agents manually and do not spawn recursive lifecycle agents.
```

Pros:
- One edit point in `src/core/prompts.ts`; applies to `research`, `plan`, `execute`, and `verify` automatically.
- Keeps existing interpolation of agent name, model, and config key.
- Aligns with the settled decisions and avoids adding a config knob.
- Minimal churn in `commands.ts`, `install.ts`, and `extension.ts`.

Cons:
- Uniform wording across phases; less room to tailor prohibitions.

Verification:
- Update `test/core-prompts.test.ts` to assert presence of "lifecycle orchestrator", "stop and report a visible blocker", "do not continue the ... work inline", and absence of "do the work directly in this agent".
- Keep `install.ts` and `extension.ts` unchanged.

## Option 2 — Shared spawn helper plus phase-specific orchestrator clauses

Keep `renderLifecycleSpawnStrategy()` focused on spawn/routing/blocker only, and add a new helper such as `renderOrchestratorProhibitions(step: RoutedLifecycleStep): string`. Each command in `src/core/commands.ts` appends phase-specific prohibitions after the spawn strategy.

Shared helper text would keep the same spawn, route, full-prompt handoff, wait, blocker, and no-manual-switching rules as Option 1. Each command would append phase-specific text, for example `commandResearch` could add:

```text
Orchestrator prohibitions while the research subagent is active:
- Do not perform repository reads, web searches, or artifact edits yourself.
- Do not update research.md, sources.md, evidence.md, or options.md until the subagent result is received.
```

Pros:
- More precise guardrails per phase.
- Future phase-specific policy changes touch only the relevant command.

Cons:
- More files changed (`commands.ts` in four places, new helper, additional tests).
- Risk of inconsistent wording between phases unless carefully maintained.
- Slightly larger scope than the decisions require for this change.

## Recommendation

Option 1. The settled decisions call for the smallest prompt helper change that removes the broad fallback without making OMP routing brittle. The shared helper is the right place because the orchestrator policy is identical across `research`, `plan`, `execute`, and `verify`: spawn first, stay hands-off, fail closed. Phase-specific tweaks can be added later if observed model behavior shows they are needed.

