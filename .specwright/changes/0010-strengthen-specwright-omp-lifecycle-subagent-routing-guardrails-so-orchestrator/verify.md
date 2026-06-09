# Verification

## Result

PASS

## Issues

No issues.

## Observed output

### T001 — Prompt guardrail clauses (src/core/prompts.ts)

Read `src/core/prompts.ts` and confirmed `renderLifecycleSpawnStrategy()` contains:
- **Lifecycle-orchestrator clause** (line 17): `You are the lifecycle orchestrator for this ${input.step} phase.`
- **First-action clause** (line 18): `Your first operational action is to use OMP's \`task\` tool to spawn \`${agentName}\` for the ${input.step} lifecycle work.`
- **Inline-prohibition clause** (line 22): `While the \`${agentName}\` subagent is active, do not perform implementation-file reads, code or artifact edits, test runs, artifact or status updates, or completion claims.`
- **Fail-closed blocker clause** (line 24): `If the \`task\` tool, \`${agentName}\`, or model \`${model}\` is unavailable, report a visible blocker naming the missing component and stop; do not proceed with direct inline work.`

Confirmed the removed fallback sentence **`do the work directly in this agent with the same rules instead of blocking`** is no longer present anywhere in the file.

### T002 — Prompt tests (test/core-prompts.test.ts)

```
$ bun test test/core-prompts.test.ts
Test Results:
   PASS: 6 passed
```

All 6 prompt tests pass, including assertions for the new guardrail contract.
