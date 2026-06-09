# Options

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Option 1: Direct extension-managed dispatch

Specwright extension code would directly spawn the exact Specwright subagent/model for research, plan, execute, and verify.

- Pros: deterministic routing; less reliance on main-agent prompt compliance.
- Cons: blocked by current local API evidence: `ExtensionApiLike` only sends user messages, and OMP task tool model selection is tied to discovered agent definitions/settings.
- Status: rejected for this change.

## Option 2: Prompt-based routing with generated agent model frontmatter

Specwright installs OMP-compatible `.omp/agents/specwright-*.md` definitions whose `model` frontmatter is derived from `agents.<role>.model`; lifecycle prompts instruct the receiving OMP agent to use the `task` tool with the matching Specwright agent.

- Pros: works with current OMP; satisfies per-agent config; keeps OMP as the runtime boundary; preserves future replacement by direct dispatch; avoids manual user switching.
- Cons: actual spawn still depends on prompt/tool compliance; generated agent files can become stale unless config changes regenerate them.
- Status: recommended.

## Option 3: Static agent model frontmatter only

Specwright would hardcode researcher/executor/verifier to `pi/task` and planner to `pi/plan` in generated agent definitions with no Specwright config keys.

- Pros: smallest implementation; no config validation or descriptor work.
- Cons: fails the approved configurable `agents.*.model` requirement and forces users to edit OMP files/settings manually.
- Status: rejected.

## Option 4: Config-only routing without regenerating agent files

Specwright would store `agents.*.model` but mention the values only in prompts, leaving `.omp/agents/specwright-*.md` static.

- Pros: avoids touching installer structure.
- Cons: conflicts with OMP's actual model resolution path, which uses settings and agent frontmatter; likely produces stale or misleading routing.
- Status: rejected.

## Recommendation

Implement Option 2. It matches current OMP mechanics, satisfies the approved per-agent config surface, and keeps the design swappable if OMP later exposes direct extension-managed dispatch.
