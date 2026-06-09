# Constraints

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Product constraints

- Routing must feel native to OMP from day one.
- Agent model mapping must be explicit and configurable through per-agent config objects: planner defaults to `pi/plan`; researcher/executor/verifier default to `pi/task`.
- Agent definitions remain capability prompts, not personas.
- Memory/session-memory is out of scope because OMP provides native memory/hindsight.

## Technical constraints

- `ExtensionApiLike` does not expose direct subagent spawning or model override configuration; lifecycle prompts must instruct the receiving OMP agent to use the `task` tool.
- OMP `task` spawns resolve model selection from the spawned agent definition frontmatter, so Specwright must generate agent files with the desired `model` frontmatter.
- Existing config validation rejects unknown keys; new `agents.<researcher|planner|executor|verifier>.model` keys require updates to config types, defaults, validators, descriptors, and tests.
- Subagents should declare `spawns: []` unless recursive spawning is deliberately introduced later.
- Existing CLI-parseable `tasks.md` contract must be preserved.

## Open constraints

- If OMP later exposes extension-managed subagent dispatch, this design should remain swappable without changing Specwright artifacts.
- Agent update policy is initially simple regeneration on `specwright init --force` and `config set agents.*.model`; richer migration/versioning is deferred.
