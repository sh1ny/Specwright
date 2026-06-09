# Discussion

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Starting point

The smart-subagent-routing plan settled on prompt-based OMP routing plus generated agent model frontmatter.

## Settled inputs

- Use OMP-compatible agent definitions under `.omp/agents/`.
- Keep the four current routed phases and agents: `specwright-researcher`, `specwright-planner`, `specwright-executor`, `specwright-verifier`.
- Do not add discuss or handoff subagents in this change.
- Use strong prompt-level routing by default: lifecycle prompts should instruct the receiving OMP agent to spawn the matching Specwright subagent, while preserving fallback behavior when spawning is unavailable or fails.
- Use per-agent config objects rather than flat `modelRoles.*` keys. Initial configurable field: `agents.<researcher|planner|executor|verifier>.model`, defaulting planner to `pi/plan` and researcher/executor/verifier to `pi/task`.
- Regenerate generated OMP agent definitions on `specwright init --force` and after config changes to `agents.*.model`.
- Exclude Specwright memory/session-memory features.

## Checkpoints

- Phase scope: settled to research/plan/execute/verify only. Evidence: current generated agent set contains exactly four `specwright-*` cards in `src/runtime/omp/install.ts:58-116`; `decisions.md` already defers discuss/handoff subagents.
- Spawn policy: settled to strong default with fallback. Evidence: `intent.md` requires no manual user switching and fallback responsibility; `evidence.md` notes direct extension-managed dispatch is unavailable, so prompt-level routing is required.
- Config surface: settled to per-agent config objects, not flat `modelRoles.*` keys. Evidence: `evidence.md` shows config validation rejects unknown keys and generated agent frontmatter is the write target, so the schema must explicitly model agent fields.
- Regeneration policy: settled to `specwright init --force` plus `agents.*.model` config changes. Evidence: `src/runtime/omp/install.ts:118-138` already writes owned OMP files during init; `evidence.md` identifies config-set routing as the other write path.

## Remaining questions

None blocking for research.
