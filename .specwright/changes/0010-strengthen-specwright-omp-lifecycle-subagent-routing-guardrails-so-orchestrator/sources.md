# Sources

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## URLs

No external URLs were consulted. The behavior is fully defined by the local OMP extension API, agent generation, and prompt helpers listed below.

## Local references

- `src/core/prompts.ts` — `renderLifecycleSpawnStrategy()`, `renderSubagentRetryClause()`, `renderContextBudget()`, `renderCheckpointClause()`.
- `src/core/commands.ts` — `commandResearch()`, `commandPlan()`, `commandExecute()`, `commandVerify()` prompt assembly.
- `src/runtime/omp/install.ts` — `AGENT_DEFINITIONS`, `renderAgent()`, generated frontmatter with `model` and `spawns: []`.
- `src/runtime/omp/extension.ts` — `specwrightOmpExtension()` and `pi.sendUserMessage()`.
- `src/runtime/omp/types.ts` — `ExtensionApiLike` interface.
- `src/core/state.ts` — `defaultConfig()` agent model defaults.
- `test/core-prompts.test.ts` — existing assertions for lifecycle spawn strategy.

