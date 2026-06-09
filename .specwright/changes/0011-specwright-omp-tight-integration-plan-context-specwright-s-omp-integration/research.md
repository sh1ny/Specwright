# Research

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local findings

1. `ExtensionApiLike` is minimal. `src/runtime/omp/types.ts` exports only `registerCommand`, `sendUserMessage`, `on`, `setLabel`, `logger`, plus `ui.notify/setStatus` and `waitForIdle`. No `registerTool`, `getActiveTools`, `setActiveTools`, or richer UI primitives.
2. Core prompts contain OMP-specific prose. `src/core/prompts.ts` `renderLifecycleSpawnStrategy()` embeds `task` tool and model routing instructions. `renderDiscussPrompt()` embeds OMP `ask` behavior. Neither branches on runtime.
3. No runtime branching in prompt assembly. `src/core/commands.ts` calls `renderLifecycleSpawnStrategy`/`renderDiscussPrompt` directly for research, plan, execute, verify, and discuss. `ctx.runtime` exists but is not used to select prompt renderers.
4. Status surface is thin. `src/runtime/omp/status.ts` only renders strings containing `tasks=`; it does not run verification or surface `blocked`/`drift`.
5. Adapter lacks version marker. `src/runtime/omp/install.ts` `PACKAGE_JSON` template has no `specwrightAdapterVersion` field. `.omp/extensions/specwright/package.json` confirms the field is absent.
6. `CommandResult` already supports tool returns. `src/core/types.ts` has `ok`, `summary`, `filesCreated`, `filesUpdated`, `statusText`, and `exitCode`. JSON tool returns can mirror this shape.
7. Validation/drift primitives exist. `src/core/validators.ts` `validateChange()` returns `ValidationReport` with `ok` and `issues[]`. `syncChangeTasksFromMarkdown` issues are surfaced as SW009 errors in `commandVerify`.
8. Mock surface needs expansion. `test/omp-extension.test.ts` mocks only the current narrow `ExtensionApiLike`; tests for tool registration and `tool_call` interception will require new mock fields.

## External findings

1. OMP `tool_call` interception is supported and blocking. `pi.on("tool_call", ...)` handlers can return `{ block: true, reason: string }` to fail closed. Throwing also blocks execution. Source: `can1357/oh-my-pi/docs/hooks.md`.
2. OMP `registerTool` API exists. Extensions can call `pi.registerTool({ name, label, description, parameters, execute })` with TypeBox/Zod schemas. The `execute` signature receives `(toolCallId, params, onUpdate, ctx, signal)`. Source: `can1357/oh-my-pi/docs/custom-tools.md` and `yukukotani/pi-voice` reference docs.
3. `tool_call` event shape includes `toolName` and `input`. For the `task` tool, `input.agent` can contain the target agent name, matching the intent's interception logic. Source: `can1357/oh-my-pi/packages/coding-agent/src/extensibility/hooks/types.ts`.

## Implications

- No API blockers surfaced. The two high-risk assumptions, blocking `tool_call` interception and `registerTool`, are confirmed by primary OMP documentation.
- `ExtensionApiLike` widening is safe to model after the documented API; the actual runtime is an OMP ExtensionAPI/HookAPI superset.
- Prompt extraction is straightforward: `src/core/prompts.ts` already exports renderer functions. Moving OMP clauses to `src/runtime/omp/prompts.ts` and adding runtime-neutral bases keeps CLI behavior intact.
- Status/drift integration can reuse existing `validateChange` and `syncChangeTasksFromMarkdown`; the gap is OMP-side rendering and caching.
- Structured tool return schema should reuse `CommandResult` fields to avoid a second public schema.

