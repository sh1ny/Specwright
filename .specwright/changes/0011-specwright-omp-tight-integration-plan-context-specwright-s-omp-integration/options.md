# Options

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Option 1: Monolithic integration

Follow the intent's implementation sequence in one change:
1. Widen `ExtensionApiLike` and update mocks.
2. Register `specwright_status`, `specwright_checkpoint`, and `specwright_validate` tools in `extension.ts`.
3. Add `pi.on("tool_call", ...)` interception with `pendingRoute` state.
4. Create `src/runtime/omp/prompts.ts`, neutralize `src/core/prompts.ts`, and branch in `commands.ts`.
5. Extend `status.ts` to run verify and surface `blocked`/`drift`.
6. Add `specwrightAdapterVersion` to `install.ts`.

Pros: delivers the full acceptance criteria in one unit; preserves the intended sequencing of widening, tools, routing, prompts, status, and versioning. Cons: larger diff; if an OMP API nuance is mis-modeled, the whole change is at risk.

## Option 2: Staged rollout

Phase A: prompt adapter split, structured tools, adapter version marker. These are low-risk and testable without runtime interception.

Phase B: lifecycle routing enforcement and richer status/drift UI. These depend on interception behavior and benefit from observing Phase A in production.

Pros: smaller review surface per phase; reduces blast radius if `tool_call` behavior differs from docs. Cons: violates the constraint that prompt-only routing is not an acceptable final outcome for this change; Phase A would ship without enforcement.

## Recommendation

Option 1. External research confirmed both `registerTool` and blocking `tool_call` interception. The intent already sequences risk correctly by widening the interface before building on it. Splitting would leave lifecycle routing unenforced, which the constraints reject as a final outcome. Keep the monolithic plan and verify each sub-step with targeted tests.

