# Intent

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">
## Goal

## Users

## Non-goals

</frozen-after-approval>

## Approval notes
### Source request
@EXTENSION-PLAN.md
### Expanded request
# Specwright OMP Tight-Integration Plan

## Context

Specwright’s OMP integration today is a thin adapter: it registers the `/specwright` slash command, forwards parsed arguments to the runtime-neutral `runSpecwrightCommand` kernel, surfaces status/notifications via `ctx.ui`, and injects generated prompts as user messages through `pi.sendUserMessage(result.prompt)`. This works, but it leaves lifecycle delegation, checkpoint safety, and OMP-specific UX entirely to prompt text. This document specifies the next increment of tighter OMP integration.

## Current boundary

- Entry point: `src/runtime/omp/extension.ts` registers the `specwright` command and calls `runSpecwrightCommand({ cwd, runtime: "omp", ... }, splitArgs(args))`.
- Status: `src/runtime/omp/status.ts` refreshes on `session_start`, `goal_updated`, `turn_end`; renders `Specwright · <change> · <status> · tasks=x/y` only when the text contains `tasks=`.
- Types: `src/runtime/omp/types.ts` exposes a minimal `ExtensionApiLike` used for testing: `registerCommand`, `sendUserMessage`, `on`, `setLabel`, `logger`, plus UI subsets (`notify`, `setStatus`, `waitForIdle`).
- Adapter install: `src/runtime/omp/install.ts` writes `.omp/extensions/specwright/{package.json,index.ts}`, `.omp/rules/specwright-workflow.md`, and `.omp/agents/specwright-{researcher,planner,executor,verifier}.md` with `model` frontmatter and `spawns: []`.
- Prompts: `src/core/prompts.ts` — `renderLifecycleSpawnStrategy()` emits OMP-specific text telling the receiving model to spawn a `specwright-*` agent via OMP’s `task` tool; `renderDiscussPrompt()` references OMP `ask` behavior directly.

## Integration candidates

| Priority | Candidate | Benefit |
|---|---|---|
| High | Lifecycle routing enforcement | Block the first tool call in `research`/`plan`/`execute`/`verify` if it is not `task` with the expected `specwright-*` agent. Fails closed on weak models that skip delegation. |
| High | Structured Specwright tools | Register `specwright_status`, `specwright_checkpoint`, `specwright_validate` as OMP tools so the model uses typed parameters instead of shell-style strings. |
| High | OMP-specific prompt adapter | Move OMP clauses (`task` tool, `ask` dialog) out of core prompts into `src/runtime/omp/prompts.ts`; keep CLI/headless prompts neutral. |
| Medium | Richer status UI | Surface validation blockers, task drift, and checkpoint-needed state in the OMP status line and notifications. |
| Medium | Adapter version marker | Add a version field to generated `.omp/extensions/specwright/package.json` so future Specwright releases can detect stale adapters. |

## Implementation sequence

1. **Widen `ExtensionApiLike`**
   - In `src/runtime/omp/types.ts`, add `registerTool`, `getActiveTools`, `setActiveTools` to `ExtensionApiLike` and expose `ui.select/input/editor/confirm` on `OmpContextLike`.
   - Update `test/omp-extension.test.ts` mocks to satisfy the widened interface.

2. **Add structured tools**
   - In `src/runtime/omp/extension.ts`, register three tools:
     - `specwright_status` → no params → returns JSON from `runSpecwrightCommand(["status", "--json"])`.
     - `specwright_checkpoint` → params `{ change?: string, phase?: string, task?: string, files: string[] }` → validates mutual exclusivity of `phase`/`task`, then calls `runSpecwrightCommand(["checkpoint", change ?? "", phase ? "--phase ${phase}" : "--task ${task}", "--files", files.join(",")])`.
     - `specwright_validate` → params `{ change?: string }` → calls `runSpecwrightCommand(["verify", change ?? "", "--json"])`.
   - Tool results should mirror `CommandResult` fields and preserve `ok`/error semantics.

3. **Enforce lifecycle routing**
   - In `src/runtime/omp/extension.ts`, add a `pi.on("tool_call", ...)` handler.
   - Maintain a `pendingRoute` variable set when `/specwright research|plan|execute|verify` is handled: map step → expected agent (`research`→`specwright-researcher`, `plan`→`specwright-planner`, `execute`→`specwright-executor`, `verify`→`specwright-verifier`).
   - On the next `tool_call`, if `pendingRoute` is set and the call is not `task` with `params.agent === expectedAgent`, return `{ block: true, reason: "..." }` naming the expected agent and step.
   - Clear `pendingRoute` after the first routed tool call or after a timeout of one turn.

4. **Extract OMP prompt clauses**
   - Create `src/runtime/omp/prompts.ts`:
     - `renderOmpLifecycleSpawnStrategy(step, config)` — OMP-specific spawn instructions.
     - `renderOmpDiscussPrompt(config)` — OMP `ask`/dialog instructions.
   - In `src/core/prompts.ts`, replace OMP-specific language with runtime-neutral base text.
   - In `src/core/commands.ts`, branch on `ctx.runtime === "omp"` to call the OMP renderers; otherwise use the neutral renderer.
   - Update `test/core-prompts.test.ts` to assert the split: CLI prompts stay neutral; OMP prompts contain `task` tool and `ask` references.

5. **Expand status/drift surfacing**
   - In `src/runtime/omp/status.ts`, extend `loadStatusText` to also run `runSpecwrightCommand(["verify", "--json"])` when a change exists.
   - If the verify report has errors, render `Specwright · <change> · blocked · <first-error-code>`.
   - If task drift is detected (SW009), render `Specwright · <change> · drift · tasks=<done>/<total>`.
   - Use `ctx.ui.notify(message, "warning")` when the status transitions to `blocked` or `drift`.

6. **Adapter version marker**
   - In `src/runtime/omp/install.ts`, add `"specwrightAdapterVersion": "1"` to the generated `PACKAGE_JSON` template.
   - Add a helper `adapterNeedsRegeneration(cwd)` that reads `.omp/extensions/specwright/package.json` and returns true when the marker is missing or mismatched.
   - Call it from `commandInit` and `commandConfig` when OMP is enabled; if true, rewrite the adapter files.

## Files that disambiguate the work

- `src/runtime/omp/types.ts` — dictates what OMP APIs the extension can assume; widening here drives mock/test changes.
- `src/runtime/omp/extension.ts` — the only place that may register tools and intercept `tool_call`; also owns `sendUserMessage(result.prompt)`.
- `src/core/prompts.ts` — currently contains OMP-specific prose that must become runtime-neutral.
- `src/core/commands.ts` — command implementations assemble prompts; must select renderer by `ctx.runtime`.
- `test/omp-extension.test.ts` — defines the mock OMP surface and must be updated to cover tool registration and routing enforcement.

## Verification

- `bun test` passes.
- `bun run typecheck` passes.
- Manual OMP test: start a Specwright project, run `/specwright research 0001`. The model’s first non-`task` tool call must be blocked with a reason naming `specwright-researcher`.
- Manual OMP test: invoke the `specwright_validate` tool on a change with malformed `tasks.md`; the tool result must contain the validation report and `verify.md` must be updated on disk.
- Manual OMP test: introduce task drift in `tasks.md` and trigger a status refresh; the OMP status line must show `drift`.

## Assumptions

- OMP exposes blocking `tool_call` interception at the extension layer and `event.input` includes `agent` for `task` calls (observed in `omp://extensions.md` and `omp://tools/task.md`).
- No direct extension-managed subagent spawn API exists in the current OMP surface, so enforcement remains interception-based.
- Agent names remain `specwright-researcher`, `specwright-planner`, `specwright-executor`, `specwright-verifier`.

### Discuss refinements

- Include all five integration candidates in change 0011: lifecycle routing enforcement, structured tools, OMP prompt adapter split, richer status/drift UI, and adapter version marker.
- Treat structured tools as a strong candidate whose exact return schema must be confirmed during research against OMP's tool API.
- Keep the lifecycle goal strict: lifecycle commands should fail closed when blocking `tool_call` interception is supported, rather than relying only on prompt compliance.
- Status/drift integration should avoid repeated expensive validation by caching verification work against relevant artifact mtimes.