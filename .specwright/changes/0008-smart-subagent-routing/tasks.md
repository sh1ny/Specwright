# Tasks

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Wave 1: Config routing surface

- [x] T001: Add agent model config shape
  - Files: `src/core/types.ts`, `src/core/state.ts`, `src/core/validators.ts`
  - Action: Add `agents.researcher.model`, `agents.planner.model`, `agents.executor.model`, and `agents.verifier.model`; default to `pi/task`, `pi/plan`, `pi/task`, and `pi/task`; deep-merge missing agent defaults into existing configs; reject missing or empty model strings.
  - Acceptance: Fresh and existing configs load with all four populated agent model values; invalid or empty agent model values fail validation with actionable errors.
  - Verification: Run `bun test test/core-validators.test.ts test/core-commands.test.ts`.

- [x] T002: Expose agent model config commands
  - Files: `src/core/commands.ts`, `test/core-commands.test.ts`
  - Action: Add `agents.*.model` descriptors for `config get` and `config set`; add tests for default reads, exact-string persistence, and validation failures.
  - Acceptance: `specwright config get agents.planner.model` returns `pi/plan`; `specwright config set agents.planner.model custom/plan-model` persists that exact value without touching unrelated config.
  - Verification: Run `bun test test/core-commands.test.ts`.

## Wave 2: OMP agent generation

- [x] T003: Render OMP agents from config
  - Files: `src/runtime/omp/install.ts`, `test/omp-extension.test.ts`
  - Action: Replace static generated agent Markdown with config-driven rendering; include explicit `model` and `spawns: []` frontmatter for researcher, planner, executor, and verifier agents.
  - Acceptance: Installed `.omp/agents/specwright-*.md` files contain the configured model value for each lifecycle agent and `spawns: []`; existing agent descriptions/tools remain intact.
  - Verification: Run `bun test test/omp-extension.test.ts`.

- [x] T004: Regenerate agents on model changes
  - Files: `src/core/commands.ts`, `src/runtime/omp/install.ts`, `test/core-commands.test.ts`, `test/omp-extension.test.ts`
  - Action: Pass config into `installOmpAdapter()` during init; after successful `config set agents.*.model`, reinstall generated OMP agent files when the OMP runtime is enabled.
  - Acceptance: Updating `agents.planner.model` rewrites `.omp/agents/specwright-planner.md` with the new model value while preserving other generated OMP artifacts.
  - Verification: Run `bun test test/core-commands.test.ts test/omp-extension.test.ts`.

## Wave 3: Lifecycle prompt routing

- [x] T005: Add lifecycle spawn strategy helper
  - Files: `src/core/prompts.ts`, `test/core-prompts.test.ts`
  - Action: Replace the research-only retry clause with a lifecycle-aware helper for research, plan, execute, and verify that accepts config and renders the matching Specwright agent/model instructions.
  - Acceptance: Generated strategy text names the correct agent, configured model value, required `task` tool usage, wait-for-result behavior, and direct-work fallback for each routed lifecycle phase.
  - Verification: Run `bun test test/core-prompts.test.ts`.

- [x] T006: Wire routing into lifecycle prompts
  - Files: `src/core/commands.ts`, `test/core-prompts.test.ts`
  - Action: Inject the spawn strategy into research, plan, execute, and verify prompt assembly; leave discuss, tasks, publish, handoff, and unrelated command prompts direct.
  - Acceptance: Printed prompts for research, plan, execute, and verify include the correct Specwright agent names; `tasks.md` generation remains CLI-parseable and does not introduce nested task checkboxes.
  - Verification: Run `bun test test/core-prompts.test.ts`.

## Wave 4: Focused verification

- [x] T007: Verify routed defaults end to end
  - Files: `test/core-commands.test.ts`, `test/core-prompts.test.ts`, `test/omp-extension.test.ts`
  - Action: Add regression coverage tying default config values to generated prompt routing and installed OMP agent frontmatter.
  - Acceptance: Fresh `specwright init` produces config, prompts, and OMP agent files with planner on `pi/plan` and researcher/executor/verifier on `pi/task`.
  - Verification: Run `bun test test/core-commands.test.ts test/core-prompts.test.ts test/omp-extension.test.ts`.

- [x] T008: Run focused quality gates
  - Files: `src/core/types.ts`, `src/core/state.ts`, `src/core/validators.ts`, `src/core/commands.ts`, `src/core/prompts.ts`, `src/runtime/omp/install.ts`, `test/core-commands.test.ts`, `test/core-prompts.test.ts`, `test/omp-extension.test.ts`
  - Action: Run the focused test suites and TypeScript typecheck after implementation.
  - Acceptance: Focused tests and typecheck pass without suppressions; no task checkboxes are marked complete until the corresponding implementation verification has passed.
  - Verification: Run `bun test test/core-validators.test.ts test/core-commands.test.ts test/core-prompts.test.ts test/omp-extension.test.ts && bun run typecheck`.
