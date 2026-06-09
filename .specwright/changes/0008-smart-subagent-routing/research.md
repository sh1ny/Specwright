# Research

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local findings

- Approved config surface is per-agent objects, not the earlier `modelRoles.*` wording: `agents.researcher.model`, `agents.planner.model`, `agents.executor.model`, and `agents.verifier.model` (`intent.md:25-28`, `constraints.md:7-17`).
- Current `SpecwrightConfig` has `defaults`, `packs`, `runtimes`, and `workflow`, but no `agents` object (`src/core/types.ts:22-49`). A repository search found no `modelRoles`, `agents.<role>.model`, `model:`, or `spawns:` occurrences in `src/` or `test/`.
- `defaultConfig()` returns no agent/model defaults (`src/core/state.ts:12-35`), and `loadConfig()` only deep-merges `runtimes.omp` and `workflow` (`src/core/state.ts:248-282`), so partial `agents.*` overrides need merge support.
- `validateSpecwrightConfig()` validates all existing top-level config sections and must add non-empty string validation for each agent model (`src/core/validators.ts:55-76`).
- `CONFIG_KEY_DESCRIPTORS` is the complete `config get/set` registry and currently ends at `workflow.remote` (`src/core/commands.ts:230-316`). Once descriptors are added, generic get/set parsing, validation, and persistence already run through `commandConfig()` (`src/core/commands.ts:880-918`).
- `commandInit()` writes default config before installing the OMP adapter, then calls `installOmpAdapter({ cwd, force })` without config (`src/core/commands.ts:387-404`). Agent generation must receive loaded/default config or derive defaults consistently.
- `installOmpAdapter()` writes four static agent Markdown strings from `AGENTS` (`src/runtime/omp/install.ts:58-138`). Frontmatter currently has `name`, `description`, `tools`, and researcher `read-summarize`, but no `model` or `spawns`.
- `ExtensionApiLike.sendUserMessage()` only accepts message delivery options, not agent/model routing (`src/runtime/omp/types.ts:1-10`), and the OMP extension forwards generated prompts as plain user messages (`src/runtime/omp/extension.ts:19-27`).
- Lifecycle prompt assembly exists for research, plan, execute, and verify (`src/core/commands.ts:588-624`, `src/core/commands.ts:626-664`, `src/core/commands.ts:779-793`, `src/core/commands.ts:796-838`). Only research includes the scout retry clause today (`src/core/prompts.ts:3-5`).
- Tests already cover prompt text, config keys, and generated OMP agent files (`test/core-prompts.test.ts:7-84`, `test/core-commands.test.ts:87-184`, `test/omp-extension.test.ts:215-246`).

## OMP source findings

- OMP discovers project agent definitions from `.omp/agents/*.md` and parses Markdown YAML frontmatter (`/home/bgshi/Development/Others/oh-my-pi/packages/coding-agent/src/task/discovery.ts:1-13`, `:59-122`).
- OMP agent definitions support `spawns` and `model` fields (`/home/bgshi/Development/Others/oh-my-pi/packages/coding-agent/src/task/types.ts:165-181`), and frontmatter parsing accepts `spawns` as `*`, CSV, or array plus `model` as a model list (`/home/bgshi/Development/Others/oh-my-pi/packages/coding-agent/src/discovery/helpers.ts:223-273`).
- The bundled OMP `task` agent uses `model: pi/task`; `quick_task` uses `model: pi/smol` (`/home/bgshi/Development/Others/oh-my-pi/packages/coding-agent/src/task/agents.ts:51-69`).
- OMP task execution resolves model priority from settings override first, then agent frontmatter, then session/default fallback (`/home/bgshi/Development/Others/oh-my-pi/packages/coding-agent/src/task/index.ts:690-700`; `/home/bgshi/Development/Others/oh-my-pi/packages/coding-agent/src/config/model-resolver.ts:602-620`).

## External findings

No web research was needed. Local repository code plus local OMP source answered the API and model-routing questions.

## Implications

- Implement `agents.<role>.model` config with defaults: planner `pi/plan`, researcher/executor/verifier `pi/task`.
- Generate OMP agent frontmatter from config with explicit `model` and `spawns: []`.
- Regenerate agent files on `specwright init --force`; for `config set agents.*.model`, either regenerate immediately or clearly route users through a forced adapter reinstall. Immediate regeneration best satisfies “no manual switching.”
- Add prompt-level routing instructions for research, plan, execute, and verify because extension-managed dispatch is unavailable.
- Preserve `tasks.md` parsing and task execution contracts; routing text should wrap prompts, not alter artifacts.
