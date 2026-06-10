# Evidence

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local evidence

- Current branch source already uses OMP object-form tools: `pi.registerTool({ name, label, description, parameters, execute })` in `src/runtime/omp/extension.ts:58-64,73-79,108-114`.
- Current lifecycle blocker already reads current event fields: `toolCall.toolName` and `toolCall.input?.agent` in `src/runtime/omp/extension.ts:125-136`.
- Passive status refresh is mutating: `src/runtime/omp/status.ts:122` invokes `runSpecwrightCommand(..., ["verify", "--json"])`, which is the verification command path.
- Refresh race remains plausible: `refreshInFlightByCwd` is checked at `src/runtime/omp/status.ts:71-73`, but set only at `src/runtime/omp/status.ts:164` after awaited state/artifact work.
- Stale marker overwrite remains: `adapterNeedsRegeneration` feeds `force` in init/config (`src/core/commands.ts:441-443,1058-1060`), and `installOmpAdapter` overwrites static/rule files with `input.force` (`src/runtime/omp/install.ts:150-172`).
- Stale lifecycle route remains: `pendingRoute` is assigned before command success/prompt emission in `src/runtime/omp/extension.ts:31-36`.
- Test gaps remain for lifecycle success and checkpoint forwarding: empty temp-dir lifecycle calls at `test/omp-extension.test.ts:689-721`; weak non-git checkpoint assertion at `test/omp-extension.test.ts:641-667`.
- 0011 metadata cleanup remains: raw markdown title at `.specwright/state.json:449-452`.

## Research attempts

- Lifecycle orchestrator spawned `specwright-researcher` for this phase. The worker returned useful local/API findings but failed because its tool context lacked write/edit capability; parent completed artifact writes from the observed result and fresh local reads.

## Decisions supported

- Do not implement obsolete-API fixes that would churn already-correct OMP integration.
- Do implement non-mutating/race-safe status refresh, safe adapter marker handling, lifecycle route cleanup, stronger tests, 0011 verification correction, and state title cleanup.

