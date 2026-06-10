# Discussion

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Conversation notes

### 2026-06-09 — OMP tight-integration scope

Source evidence:
- `intent.md:22-30` says the current OMP adapter is thin: `/specwright` command forwarding, UI status/notifications, generated prompts sent with `pi.sendUserMessage`, and generated agent cards.
- `src/runtime/omp/extension.ts:9-29` confirms the adapter only registers the command, calls `runSpecwrightCommand`, updates status/notifications, and forwards prompts.
- `src/runtime/omp/extension.ts:36-39` refreshes status on `session_start`, `goal_updated`, `turn_end`, and clears on shutdown.
- `src/runtime/omp/types.ts:1-10` exposes no `registerTool`, active-tool controls, or typed blocking `tool_call` result yet.


## Open questions

- Structured Specwright tools are a strong candidate, but their exact result schema remains research-gated. Research must confirm whether to mirror `CommandResult` or define tool-specific report shapes.


## Settled decisions

- Scope: include all listed integration candidates from the expanded request: lifecycle routing enforcement, structured Specwright tools, OMP-specific prompt adapter, richer status/drift UI, and adapter version marker.
- Routing enforcement: fail closed when OMP supports blocking `tool_call` interception. Do not silently degrade to prompt-only behavior for lifecycle commands.
- Structured tools: keep as a strong candidate pending research confirmation of OMP `registerTool` shape and the right return contract.
- Status/drift surfacing: if implemented, run validation from status refresh only when a change exists and cache by relevant artifact mtime rather than verifying on every refresh unconditionally.

