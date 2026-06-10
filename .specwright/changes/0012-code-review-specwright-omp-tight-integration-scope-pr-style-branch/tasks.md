# Tasks

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Tasks

### Wave 1 — Runtime safety fixes

- [x] T001: Make OMP status refresh non-mutating and race-safe
  - Files: `src/runtime/omp/status.ts`; focused status tests in `test/omp-extension.test.ts` or the nearest existing status test file.
  - Action: Replace passive `verify --json` classification with direct core reader/validator logic, and create/store the per-cwd in-flight promise before any awaited work.
  - Acceptance: `session_start`, `goal_updated`, and `turn_end` refreshes never write `verify.md` or advance `.specwright/state.json`; concurrent refreshes for one cwd share one refresh path.
  - Verification: Run the focused status refresh test(s) that prove unchanged verification/state artifacts after passive refresh and single in-flight execution under concurrency.

- [x] T002: Preserve user-owned OMP files during adapter regeneration
  - Files: `src/core/commands.ts`; `src/runtime/omp/install.ts`; focused adapter install tests.
  - Action: Stop passing stale package marker detection as global `force`; regenerate only known adapter/marker content by default, preserving existing rule and agent files unless `--force` or explicit agent regeneration is requested.
  - Acceptance: Normal init/config on a stale marker does not overwrite existing `.omp/rules/*` or agent cards; explicit force/regeneration still rewrites the intended files.
  - Verification: Run focused adapter install tests covering stale marker without force, force overwrite, and explicit agent regeneration.

- [x] T003: Arm lifecycle routing only after successful prompts
  - Files: `src/runtime/omp/extension.ts`; focused lifecycle tests in `test/omp-extension.test.ts`.
  - Action: Assign `pendingRoute` only when the lifecycle command succeeds and returns/emits a prompt; clear route state on command failure or no-prompt results.
  - Acceptance: Failed or invalid lifecycle commands do not block the next unrelated tool call; successful lifecycle commands still block until the expected `task` call with `toolName` and `input.agent` arrives.
  - Verification: Run focused lifecycle tests for invalid change/no prompt and real change/successful prompt routing.

### Wave 2 — Regression coverage

- [x] T004: Harden OMP extension API and checkpoint tests
  - Files: `test/omp-extension.test.ts`; test helpers that fake OMP APIs.
  - Action: Ensure test doubles use `registerTool(definition)`, assert `definition.name`, call `definition.execute(...)`, validate `{ content, details }`, and assert checkpoint executes with exact `checkpoint`, change id, `--phase`, and `--files` argv.
  - Acceptance: Tests fail if the extension returns to the obsolete two-argument tool API, stale tool-call event fields, or drops checkpoint forwarding arguments.
  - Verification: Run focused OMP extension tests for tool registration, tool execution result shape, lifecycle blocker event shape, and checkpoint forwarding.

### Wave 3 — Workflow artifact cleanup

- [x] T005: Correct unevidenced 0011 verification claims
  - Files: `.specwright/changes/0011-specwright-omp-tight-integration-plan-context-specwright-s-omp-integration/verify.md`; its task artifact if T009 status is stored separately.
  - Action: Remove the unevidenced manual OMP PASS claim and uncheck or mark T009 not verified unless fresh manual OMP evidence is actually recorded in the artifact.
  - Acceptance: 0011 artifacts no longer state manual OMP scenarios passed without evidence; recorded verification matches observed commands and outputs only.
  - Verification: Inspect the edited 0011 artifacts and confirm no manual OMP PASS/T009 completion claim remains without adjacent evidence.

- [ ] T006: Clean the 0011 state title
  - Files: `.specwright/state.json`.
  - Action: Replace the raw markdown/context title for the 0011 state entry with the intended plain change title while preserving id, slug, paths, and status fields.
  - Acceptance: The 0011 title is plain text with no markdown heading/context prose; related state metadata remains aligned.
  - Verification: Inspect the 0011 state entry and confirm the title is clean text and JSON remains valid.

