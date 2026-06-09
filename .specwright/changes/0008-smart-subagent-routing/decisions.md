# Decisions

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Settled

- Use prompt-based OMP routing as the first implementation.
- Keep the four current subagents: `specwright-researcher`, `specwright-planner`, `specwright-executor`, `specwright-verifier`.
- Add Specwright config objects under `agents.<researcher|planner|executor|verifier>`.
- Initial per-agent configurable field is `model`.
- Default agent models:
  - `agents.researcher.model`: `pi/task`
  - `agents.planner.model`: `pi/plan`
  - `agents.executor.model`: `pi/task`
  - `agents.verifier.model`: `pi/task`
- Generate `.omp/agents/specwright-*.md` from current Specwright config, including `model` frontmatter.
- Explicitly set `spawns: []` on Specwright subagents to avoid recursive delegation by default.
- Exclude memory/session-memory functionality.

## Deferred

- Direct extension-managed dispatch if OMP exposes stable APIs later.
- Structured JSON output contracts for spawned subagents.
- Sophisticated agent definition migrations/versioning.
- Discuss/handoff subagents.

## Ready state

Ready for research. The next research phase should validate the per-agent `agents.*.model` schema and prompt-routing implementation points against local source evidence.
