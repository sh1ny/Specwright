# Tasks

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Tasks

## Wave 1 — Independent adapter and prompt seams

- [ ] T001: Widen the OMP adapter API surface
  - Files: `src/runtime/omp/types.ts`, `test/omp-extension.test.ts`
  - Action: Add `registerTool`, `getActiveTools`, `setActiveTools`, blocking `tool_call` handler typing, and richer `ui.select/input/editor/confirm` fields to the OMP-facing interfaces; update OMP test mocks with safe no-op implementations.
  - Acceptance: The widened interface models the OMP APIs needed by later tasks without changing existing command behavior; all existing OMP extension tests still construct the mock API successfully.
  - Verification: Run `bun test test/omp-extension.test.ts` and confirm existing OMP command coverage still passes.

- [ ] T002: Split neutral and OMP prompt renderers
  - Files: `src/core/prompts.ts`, `src/runtime/omp/prompts.ts`, `test/core-prompts.test.ts`
  - Action: Move lifecycle `task`/model routing and OMP `ask` instructions into OMP-specific prompt helpers; keep core prompt helpers runtime-neutral.
  - Acceptance: CLI/headless prompt text contains no OMP `task` tool or `ask` dialog references; OMP prompt helpers still name the configured lifecycle agents/models.
  - Verification: Run `bun test test/core-prompts.test.ts` with assertions for both neutral and OMP prompt text.

- [ ] T003: Add the OMP adapter version marker
  - Files: `src/runtime/omp/install.ts`, `.omp/extensions/specwright/package.json`, `src/core/commands.ts`, `test/core-init.test.ts`, `test/core-commands.test.ts`
  - Action: Add `"specwrightAdapterVersion": "1"` to generated adapter packages, implement stale-adapter detection, and make OMP-enabled init/config regenerate missing or mismatched adapters.
  - Acceptance: Freshly generated adapters include the marker; missing/mismatched markers trigger regeneration; current markers avoid unnecessary rewrites.
  - Verification: Run the targeted init/config tests that cover OMP adapter generation and stale marker handling.

## Wave 2 — Runtime behavior cutovers

- [ ] T004: Select prompt renderers by runtime
  - Files: `src/core/commands.ts`, `src/core/prompts.ts`, `src/runtime/omp/prompts.ts`, `test/core-commands.test.ts`, `test/core-prompts.test.ts`
  - Action: Branch lifecycle and discuss prompt assembly on `ctx.runtime === "omp"`; use OMP prompt helpers only for OMP and neutral helpers otherwise.
  - Acceptance: OMP lifecycle prompts preserve `specwright-*` delegation instructions; non-OMP prompts stay lifecycle-correct without OMP-specific tool/dialog prose.
  - Verification: Run `bun test test/core-commands.test.ts test/core-prompts.test.ts` for OMP and non-OMP prompt assertions.

- [ ] T005: Register structured Specwright OMP tools
  - Files: `src/runtime/omp/extension.ts`, `src/runtime/omp/types.ts`, `test/omp-extension.test.ts`
  - Action: Register `specwright_status`, `specwright_checkpoint`, and `specwright_validate` with typed inputs; translate params to `runSpecwrightCommand` argument arrays; validate checkpoint `phase`/`task` exclusivity; return serialized `CommandResult` objects.
  - Acceptance: Tools register once during extension activation, reject invalid checkpoint params before command execution, preserve `ok`/error semantics, and report files from the underlying command result.
  - Verification: Run `bun test test/omp-extension.test.ts` with tool registration, parameter translation, invalid input, and return-shape cases.

- [ ] T006: Enforce lifecycle routing through `tool_call`
  - Files: `src/runtime/omp/extension.ts`, `src/runtime/omp/types.ts`, `test/omp-extension.test.ts`
  - Action: Maintain a scoped `pendingRoute` for `research/plan/execute/verify`; block the first wrong routed tool call unless it is `task` with the expected `input.agent`; clear on expected task, `turn_end`, `session_start`, or superseding command.
  - Acceptance: Wrong first calls fail closed with a reason naming the step and expected agent; expected task calls pass and clear state; unrelated commands do not set or consume lifecycle routes.
  - Verification: Run `bun test test/omp-extension.test.ts` with simulated lifecycle prompts, wrong tool calls, correct task calls, and stale-route clearing.

- [ ] T007: Cache OMP status validation by artifact mtime
  - Files: `src/runtime/omp/status.ts`, `test/omp-extension.test.ts`
  - Action: Add a per-change cache keyed by change id plus mtime/size tuples for existing canonical change artifacts; reuse cached validation/status results until an artifact tuple changes.
  - Acceptance: Repeated status refreshes for unchanged artifacts do not rerun validation; edits to `plan.md`, `tasks.md`, or other canonical change artifacts invalidate the cache; no validation runs when no change is active.
  - Verification: Run targeted OMP status tests that count validation calls across unchanged and changed artifact mtimes.

## Wave 3 — OMP status UX

- [ ] T008: Surface blocked, drift, and checkpoint-needed status
  - Files: `src/runtime/omp/status.ts`, `test/omp-extension.test.ts`
  - Action: Use cached verify/status data to render `blocked` with the first error code, `drift` for SW009/task drift, and checkpoint-needed states; allow these statuses through the OMP status line and send warning notifications only on transitions.
  - Acceptance: Status priority is deterministic, normal `tasks=x/y` display still works, `blocked`/`drift` are visible instead of hidden, and repeated refreshes do not spam notifications.
  - Verification: Run targeted OMP status tests for normal, blocked, drift, checkpoint-needed, and transition-only notification cases.

## Wave 4 — End-to-end acceptance

- [ ] T009: Verify the complete OMP integration slice
  - Files: `src/runtime/omp/extension.ts`, `src/runtime/omp/status.ts`, `src/runtime/omp/install.ts`, `src/runtime/omp/prompts.ts`, `src/core/commands.ts`, `src/core/prompts.ts`, `src/runtime/omp/types.ts`, `test/omp-extension.test.ts`, `test/core-prompts.test.ts`, `test/core-commands.test.ts`, `test/core-init.test.ts`
  - Action: Run the targeted automated suite for changed files, then run the manual OMP scenarios for wrong first tool-call blocking, structured validate on malformed `tasks.md`, and drift status rendering.
  - Acceptance: Automated tests pass; manual OMP checks demonstrate lifecycle fail-closed behavior, structured tool validation output, and visible drift status; no unrelated implementation files are changed.
  - Verification: Run `bun run typecheck`, the targeted tests above, and the three manual OMP checks; record observed command outputs/status messages in the implementation checkpoint or final verification notes.