# Decisions

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Settled

- Treat the receiving top-level agent as a lifecycle orchestrator for routed phases.
- Make subagent spawning the first operational action when OMP's `task` tool is available.
- The prompt must name the exact target agent and configured model value.
- The prompt must require passing the full current lifecycle prompt to the subagent, including read-first files, rules, acceptance/checkpoint instructions, and task-specific file lists.
- The prompt must forbid reading implementation files, editing code, running tests, updating artifacts, or claiming completion while the routed subagent is active.
- The prompt must require waiting for the subagent result before artifact/status updates or completion claims.
- The prompt must forbid manual user agent switching and recursive lifecycle spawning.
- Research, plan, execute, and verify should all fail closed on routing failure by default.
- Fallback policy should be hard-coded in prompt text for this change, not exposed as a config knob.
- On fail-closed routing failure, the receiving OMP agent should stop with a visible blocker naming the missing `task` tool, target Specwright subagent, or configured model.

## Deferred

- Direct extension-managed dispatch.
- Runtime hooks that reject inline work after a lifecycle routing prompt.
- Structured task-tool result schemas for Specwright subagents.
- Configurable fallback policy.

## Ready state

Ready for research and planning. The next step should verify the exact existing prompt tests and decide the smallest prompt helper change that removes the broad fallback without making OMP routing brittle.