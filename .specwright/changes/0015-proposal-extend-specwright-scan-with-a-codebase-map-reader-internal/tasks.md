# Tasks

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Wave 1 — Scan surface and artifacts

- [ ] T001: Parse scan map flags
  - Files: `src/core/commands.ts`, `test/core-commands.test.ts`
  - Action: Add `map` and `refresh` parsed flags, reject neither as unknown for scan, and update scan help text for `--map`, `--refresh`, and JSON behavior.
  - Acceptance: `specwright scan --map`, `specwright scan --refresh`, and combinations with `--json`, `--force`, and `--print-prompt` parse deterministically.
  - Verification: Run targeted command parser/help tests in `test/core-commands.test.ts`.

- [ ] T002: Ensure map artifacts
  - Files: `src/core/commands.ts`, `src/core/json.ts`, `test/core-commands.test.ts`
  - Action: Make scan ensure `scan.md`, `tech-stack.md`, `architecture.md`, `codebase-map.md`, and a valid version-1 `codebase-index.json` under `projectDir(cwd)`.
  - Acceptance: Missing files are created; existing map/index content is preserved unless `--force` is used; `filesCreated`, `filesUpdated`, prompt, and `--json` result shape are accurate.
  - Verification: Run targeted scan artifact and JSON-result tests in `test/core-commands.test.ts`.

- [ ] T003: Compare refresh fingerprints
  - Files: `src/core/commands.ts`, `src/core/json.ts`, `test/core-commands.test.ts`
  - Action: Store and recompute relative-path fingerprints using mtime, size, and checksum for indexed source/test paths; feed stale/no-stale status into `scan --refresh`.
  - Acceptance: Unchanged fingerprints produce a no-stale refresh prompt; changed or missing files produce deterministic stale warnings; no graph/query/orchestration dependency is introduced.
  - Verification: Run targeted refresh stale and no-stale tests in `test/core-commands.test.ts`.

## Wave 2 — Prompts and validation

- [ ] T004: Render core map prompts
  - Files: `src/core/prompts.ts`, `src/core/commands.ts`, `test/core-prompts.test.ts`, `test/core-commands.test.ts`
  - Action: Add a runtime-neutral map prompt renderer for default, map-only, and refresh modes.
  - Acceptance: Prompt tells agents to use bounded discovery, update `codebase-map.md` and `codebase-index.json`, preserve confirmed facts, record uncertainty, and avoid OMP-specific scout wording.
  - Verification: Run targeted prompt-content tests in `test/core-prompts.test.ts` and scan prompt tests in `test/core-commands.test.ts`.

- [ ] T005: Add OMP map guidance
  - Files: `src/runtime/omp/prompts.ts`, `test/omp-extension.test.ts`, `test/core-prompts.test.ts`
  - Action: Add OMP-only wording that suggests optional parallel/scout mapping when available, without changing the core prompt contract.
  - Acceptance: OMP prompt output may mention scouts/parallel work; core prompt tests prove runtime-neutral output does not.
  - Verification: Run targeted OMP prompt tests in `test/omp-extension.test.ts` and core prompt regression tests in `test/core-prompts.test.ts`.

- [ ] T006: Validate codebase index
  - Files: `src/core/validators.ts`, `src/core/commands.ts`, `test/core-validators.test.ts`, `test/core-commands.test.ts`
  - Action: Add command-scoped validation for valid JSON, `version: 1`, required object arrays, safe relative paths, listed test existence, and stale/missing file warnings.
  - Acceptance: Scan/map/json flows surface validation issues; unsafe paths and bad shape are reported; stale or missing listed files/tests warn; unrelated lifecycle validation is not blocked.
  - Verification: Run targeted validator tests in `test/core-validators.test.ts` and scan validation tests in `test/core-commands.test.ts`.

## Wave 3 — Lifecycle pointers

- [ ] T007: Point lifecycle prompts at maps
  - Files: `src/core/commands.ts`, `test/core-commands.test.ts`
  - Action: Add optional pointer-only references to `codebase-map.md` and `codebase-index.json` in research, plan, execute, and handoff prompts when artifacts exist.
  - Acceptance: Prompts cite map artifact paths without inlining contents; absent artifacts produce no pointer; execute includes only task-relevant pointers or a reference path.
  - Verification: Run targeted lifecycle prompt tests in `test/core-commands.test.ts`.
