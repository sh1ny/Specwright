# Evidence

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local evidence

- `src/runtime/omp/types.ts` lines 1-31: `ExtensionApiLike` has `registerCommand`, `sendUserMessage`, `on`, `setLabel`, `logger`, but no `registerTool`/`getActiveTools`/`setActiveTools`. `OmpContextLike.ui` only exposes `notify` and `setStatus`.
- `src/core/prompts.ts`: `renderLifecycleSpawnStrategy` emits `OMP's \`task\` tool` and `Route to configured model`; `renderDiscussPrompt` emits `Use Oh My Pi \`ask\``. These are not runtime-conditional.
- `src/core/commands.ts` `commandResearch`/`commandPlan`/`commandExecute`/`commandVerify`: all concatenate `renderLifecycleSpawnStrategy(...)` directly into the prompt string without checking `ctx.runtime`.
- `src/runtime/omp/status.ts` `shouldDisplayStatusText`: returns `statusText.includes("tasks=")`, so `blocked`/`drift`/`idle` statuses are hidden from the OMP status line.
- `src/runtime/omp/install.ts` `PACKAGE_JSON` template and `.omp/extensions/specwright/package.json`: no `specwrightAdapterVersion` field present.
- `src/core/types.ts` `CommandResult`: `{ ok, summary, filesCreated, filesUpdated, prompt?, statusText?, exitCode }`. JSON tool outputs can serialize this directly.
- `src/core/validators.ts` `validateChange` returns `{ ok, issues }` where issues can include SW009 for unreconciled task drift. `commandVerify` already merges sync issues into the report.

## Research attempts

- Primary: delegated to `specwright-researcher` through OMP `task` as required by the lifecycle prompt. The worker assignment excluded the lifecycle spawn strategy and did not ask the researcher to spawn another lifecycle agent.
- Local: researcher performed direct repository reads of bounded local files under `src/runtime/omp/`, `src/core/`, and `test/omp-extension.test.ts`.
- External: `web_search` query for OMP extension APIs returned primary sources (`hooks.md`, `custom-tools.md`, `extensions.md`) confirming both interception and tool registration APIs.
- Fallback: no scout/agent retry was needed; the primary researcher result was usable.

## Decisions supported

- Widen `ExtensionApiLike` — justified by confirmed OMP `registerTool` and `pi.on("tool_call")` APIs.
- Extract OMP prompt clauses — justified by direct observation of OMP-specific prose in `src/core/prompts.ts` and absence of runtime branching in `src/core/commands.ts`.
- Implement lifecycle routing enforcement — justified by confirmed `tool_call` blocking contract.
- Reuse `CommandResult` as structured tool return shape — justified by existing shape already carrying `ok`/`summary`/`filesCreated`/`filesUpdated`.
- Cache validation by artifact mtime — justified by existing `validateChange` and `syncChangeTasksFromMarkdown` primitives; caching strategy can wrap these without new validation logic.

