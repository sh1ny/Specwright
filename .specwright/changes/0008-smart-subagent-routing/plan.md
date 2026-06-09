# Plan

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Decision

Implement smart subagent routing as OMP-native, prompt-driven delegation backed by generated Specwright agent definitions. The approved config surface is per-agent objects:

- `agents.researcher.model` defaults to `pi/task`
- `agents.planner.model` defaults to `pi/plan`
- `agents.executor.model` defaults to `pi/task`
- `agents.verifier.model` defaults to `pi/task`

Specwright will not add direct extension-managed dispatch because `ExtensionApiLike.sendUserMessage()` only forwards plain user messages (`evidence.md:13`). Instead, lifecycle prompts for research, plan, execute, and verify will instruct the receiving OMP agent to use the `task` tool with the matching Specwright agent and to fall back to direct work when spawning is unavailable (`evidence.md:14`, `evidence.md:32`).

Generated `.omp/agents/specwright-*.md` files become the source of model routing. OMP already discovers project agents, parses `model` and `spawns`, and resolves task models from settings override then agent frontmatter (`evidence.md:15`). Specwright will therefore render each generated agent with explicit `model` and `spawns: []` frontmatter (`evidence.md:30`, `evidence.md:33`).

## Implementation plan

1. Add an `agents` config object to core types, defaults, merge logic, and validation. Validate every lifecycle model as a non-empty string, preserving compatibility for existing config files that lack `agents` (`evidence.md:7`, `evidence.md:9`, `evidence.md:11`).
2. Add `agents.researcher.model`, `agents.planner.model`, `agents.executor.model`, and `agents.verifier.model` descriptors for `specwright config get/set`. Existing config command plumbing can persist new descriptors after validation (`evidence.md:10`).
3. Change OMP adapter installation from static agent Markdown to config-driven rendering. `commandInit()` must pass loaded/default config into `installOmpAdapter()` so fresh installs produce routed agent files (`evidence.md:12`).
4. Regenerate OMP agent files after successful `config set agents.*.model` when the OMP runtime is enabled. This keeps model changes from requiring manual agent switching or a separate forced reinstall (`evidence.md:31`).
5. Replace the research-only retry clause with a lifecycle-aware spawn strategy helper covering research, plan, execute, and verify. The helper must name the target agent, expected configured model, `task` tool usage, wait behavior, and direct-work fallback (`evidence.md:14`, `evidence.md:32`).
6. Wire spawn strategy text into research, plan, execute, and verify prompt assembly only. Discuss, tasks, publish, handoff, and unrelated commands remain direct to preserve the existing CLI-parseable `tasks.md` contract (`evidence.md:16`, `constraints.md:18`).
7. Update focused tests for config defaults/overrides, validation, prompt routing text, installed OMP agent frontmatter, and agent regeneration after config changes (`evidence.md:16`).

## Dependency waves

- Wave 1: Config schema/defaults/validation and config command descriptors. This unlocks every later step.
- Wave 2: OMP agent rendering and regeneration. This depends on the config shape.
- Wave 3: Lifecycle prompt routing. This depends on config defaults and can run after Wave 1; it does not depend on agent rendering internals.
- Wave 4: Focused end-to-end checks across config, prompts, installed agents, and type checking.

## Risks and mitigations

- Prompt-based routing is less deterministic than direct runtime dispatch. Mitigate with explicit spawn instructions and a direct-work fallback because no stable OMP extension dispatch API exists (`evidence.md:13`).
- Config changes can leave stale generated agent files. Mitigate by regenerating immediately after successful `config set agents.*.model` and keeping `specwright init --force` as a repair path (`evidence.md:31`).
- Existing configs may not contain `agents`. Mitigate by merging defaults into loaded config before validation (`evidence.md:9`).
- Recursive subagent spawning could create unexpected work. Mitigate with generated `spawns: []` frontmatter and no recursive dispatch in this change (`constraints.md:17`, `evidence.md:33`).