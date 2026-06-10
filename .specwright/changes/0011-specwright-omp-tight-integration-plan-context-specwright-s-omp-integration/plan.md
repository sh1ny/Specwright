# Plan

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Decision

Implement change 0011 as a clean OMP integration cutover covering all five approved candidates: lifecycle routing enforcement, structured Specwright tools, OMP-specific prompt adapters, richer status/drift UI, and an adapter version marker. No candidate is deferred. The current repo evidence shows the OMP shim is narrow, core prompts/commands embed OMP-specific lifecycle prose without runtime branching, OMP status hides blocked/drift states, generated adapter packages lack a version marker, `CommandResult` already carries the right JSON fields, and validation/drift primitives already exist (`.specwright/changes/0011-specwright-omp-tight-integration-plan-context-specwright-s-omp-integration/evidence.md`, Local evidence and Decisions supported).

The research-backed API decision is to widen `ExtensionApiLike` for the documented OMP APIs rather than inventing a second adapter layer. Blocking `pi.on("tool_call")` interception and `registerTool` are confirmed by the research summary, so lifecycle enforcement and structured tools are in scope (`research.md`, External findings; `https://github.com/can1357/oh-my-pi/blob/main/docs/hooks.md`; `https://github.com/can1357/oh-my-pi/blob/main/docs/custom-tools.md`; `https://github.com/can1357/oh-my-pi/blob/main/packages/coding-agent/src/extensibility/hooks/types.ts`).

Structured tool outputs must serialize the existing `CommandResult` shape. Inputs get typed schemas per tool, but results do not introduce a second public schema. This preserves `ok`, `summary`, `filesCreated`, `filesUpdated`, `statusText`, and `exitCode` semantics across slash commands and OMP tools (`evidence.md`, Local evidence).

## Lifecycle design

Lifecycle commands `research`, `plan`, `execute`, and `verify` set a scoped `pendingRoute` only after the OMP command successfully sends a lifecycle prompt. The route map is fixed to the installed agent names: `research -> specwright-researcher`, `plan -> specwright-planner`, `execute -> specwright-executor`, and `verify -> specwright-verifier`; the planner path remains the configured `specwright-planner` agent/model path, expected as `pi/plan` by the installed OMP agent config.

The OMP `tool_call` hook checks the first routed tool call using the documented event shape: `toolName === "task"` and `input.agent === expectedAgent`. If the call does not match, return `{ block: true, reason }` naming the lifecycle step and expected agent. Blocked calls do not clear the pending route; the route clears only after the expected `task` call, at `turn_end` timeout, `session_start`, or when a newer Specwright lifecycle command supersedes it. This fails closed for weak-model behavior without locking unrelated future turns. This design is required because prompt-only routing is explicitly disallowed and interception is confirmed (`constraints.md`, Technical constraints; `evidence.md`, Decisions supported; `research.md`, External findings).

## Implementation plan

Dependency order:

1. **Adapter contracts and prompt seams.** Widen `src/runtime/omp/types.ts` and OMP test mocks for `registerTool`, active tool APIs, richer UI primitives, and blocking `tool_call` types. Split OMP-specific prompt clauses out of `src/core/prompts.ts` into `src/runtime/omp/prompts.ts`, leaving CLI/headless prompt text neutral. Add adapter version marker/regeneration in the install path. These tasks are mostly independent.
2. **Runtime behavior cutovers.** Wire command prompt selection by `ctx.runtime`; register `specwright_status`, `specwright_checkpoint`, and `specwright_validate`; add lifecycle route interception. Structured tools call `runSpecwrightCommand` with argument arrays equivalent to the CLI and return `CommandResult` JSON.
3. **Status UX.** Add an OMP status validation cache keyed by change id plus mtime/size tuples for the canonical change artifacts in that change directory. Recompute only when the tuple changes. Render `blocked`, `drift`, and checkpoint-needed states; notify only on state transitions.
4. **Acceptance.** Run targeted tests around OMP extension behavior, prompt rendering, command prompt selection, init/config adapter regeneration, and status caching before full implementation acceptance. Manual OMP checks cover wrong first tool call blocking, structured validate on malformed tasks, and drift status rendering.

## Tradeoffs

- **Interception over direct spawn:** direct extension-managed subagent spawn is not established by research; blocking `tool_call` interception is confirmed and directly addresses weak-model noncompliance.
- **`CommandResult` reuse over custom tool results:** avoids an unverified second public result schema while still giving tools structured JSON (`evidence.md`, Local evidence).
- **Mtime cache over background validation:** cheap, deterministic, and aligned with the constraint to cache status validation by relevant artifact mtime.
- **Runtime prompt split over duplicated commands:** keeps command semantics in the core kernel while removing OMP-specific prose from neutral prompts.

## Risks

- OMP event payload names may differ between docs and runtime. Mitigation: type the hook around documented `toolName`/`input`, keep extraction localized, and test with OMP mock events.
- Status refresh may become noisy or expensive. Mitigation: mtime/size cache, priority ordering (`blocked` before `drift` before normal), and transition-only warnings.
- Adapter regeneration can overwrite stale generated files. Mitigation: gate rewrites on missing/mismatched `specwrightAdapterVersion` and reuse existing install writer behavior.
- Prompt split can introduce core/runtime import cycles. Mitigation: keep OMP prompt helpers leaf-like and verify with typecheck plus prompt/command tests.

## Acceptance strategy

Automated acceptance must show: OMP tools register and translate params correctly; lifecycle route enforcement blocks the wrong first tool call and allows the expected `task`; CLI/headless prompts contain no OMP `task`/`ask` prose; OMP prompts retain configured agent/model routing; status cache invalidates on artifact changes; adapter packages include and honor `specwrightAdapterVersion`.

Manual OMP acceptance must show: `/specwright research <change>` blocks a first non-`task` tool call with a reason naming `specwright-researcher`; `specwright_validate` on malformed `tasks.md` returns a validation report and updates verification artifacts consistently with `verify`; introducing task drift changes the OMP status line to `drift`.