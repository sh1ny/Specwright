# Intent

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">
## Goal

Add smart subagent routing for Specwright lifecycle work in OMP. Research, planning, execution, and verification should each route to the matching Specwright subagent, with planning using `pi/plan` by default and general task work using `pi/task` by default.

## Users

- Specwright users running `/specwright` inside OMP.
- Maintainers configuring model routing for different workflow phases.
- Future pack authors who need predictable agent/model defaults without changing core execution flow.

## Non-goals

- Do not add Specwright-owned memory or session-memory features; rely on OMP native memory/hindsight.
- Do not implement direct extension-managed subagent dispatch unless OMP exposes a stable API for it.
- Do not require manual user switching between agents.
- Do not broaden this into a new runtime abstraction layer.

</frozen-after-approval>

## Approval notes

Starting point derived from the approved smart-subagent-routing implementation plan. Discuss clarification keeps executor spawn-capable with main-agent fallback, limits routing to research/plan/execute/verify, and changes the config surface from flat `modelRoles.*` keys to per-agent `agents.*.model` objects.
