# Sources

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## URLs

- None. `online=auto` did not require web search because local Specwright code and local OMP source answered the extension API, agent discovery, and model resolution questions.

## Local references

- `intent.md:6-21`, `intent.md:25-28` — approved goal/non-goals and per-agent config surface.
- `constraints.md:5-23` — model defaults, OMP-native routing, no direct extension dispatch, and generated agent frontmatter constraints.
- `src/core/types.ts:22-49` — current `SpecwrightConfig` shape lacks `agents`.
- `src/core/state.ts:12-35`, `src/core/state.ts:248-282` — default config and stored config merge behavior.
- `src/core/validators.ts:55-76` — config validation coverage.
- `src/core/commands.ts:230-316` — descriptor-backed config key registry.
- `src/core/commands.ts:387-404` — init writes config and installs OMP adapter.
- `src/core/commands.ts:588-624`, `src/core/commands.ts:626-664`, `src/core/commands.ts:779-793`, `src/core/commands.ts:796-838` — lifecycle prompt assembly points.
- `src/core/commands.ts:880-918` — generic config get/set flow.
- `src/core/prompts.ts:3-5` — existing research scout retry clause.
- `src/runtime/omp/install.ts:58-138` — generated OMP agent files and adapter install flow.
- `src/runtime/omp/extension.ts:19-27`, `src/runtime/omp/types.ts:1-10` — extension prompt delivery API lacks agent/model routing.
- `test/core-prompts.test.ts:7-84` — prompt regression coverage.
- `test/core-commands.test.ts:87-184` — config get/set regression coverage.
- `test/omp-extension.test.ts:215-246` — generated adapter/agent file regression coverage.

## Local OMP source references

- `/home/bgshi/Development/Others/oh-my-pi/packages/coding-agent/src/task/discovery.ts:1-13`, `:59-122` — `.omp/agents/*.md` project agent discovery.
- `/home/bgshi/Development/Others/oh-my-pi/packages/coding-agent/src/task/types.ts:133-139`, `:165-181` — task tool schema has no per-call model override; agent definitions carry `model`/`spawns`.
- `/home/bgshi/Development/Others/oh-my-pi/packages/coding-agent/src/discovery/helpers.ts:223-273` — frontmatter parser accepts `model` and `spawns`.
- `/home/bgshi/Development/Others/oh-my-pi/packages/coding-agent/src/task/agents.ts:51-69` — bundled task-agent model aliases.
- `/home/bgshi/Development/Others/oh-my-pi/packages/coding-agent/src/task/index.ts:690-700` — model selection uses settings override then agent model.
- `/home/bgshi/Development/Others/oh-my-pi/packages/coding-agent/src/config/model-resolver.ts:602-620` — agent model pattern resolution order.