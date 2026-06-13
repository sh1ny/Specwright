# Tasks

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Wave 1 - Builder and shared type ownership

- [x] T001: Move CodebaseIndex ownership into the builder module
  - Files: `src/core/codebase-index.ts`, `src/core/commands.ts`, `src/core/validators.ts`
  - Action: Create the new module with `CodebaseIndex`, builder option/result interfaces, cap constants, and reserved deterministic risk areas; remove duplicate local `CodebaseIndex` definitions and import the shared type.
  - Acceptance: There is exactly one `CodebaseIndex` type definition; commands and validators import it; no compatibility alias remains.
  - Verification: Run `bun run typecheck` after this cutover compiles with downstream tasks applied.

- [x] T002: Implement deterministic project discovery and classification
  - Files: `src/core/codebase-index.ts`, `test/core-commands.test.ts`
  - Action: Add Git-assisted discovery with deterministic filesystem fallback, default excludes, symlink skipping with risk recording, stable path sorting, package script extraction, entrypoint/module/test/verification-command classification, and scan/index caps.
  - Acceptance: Non-Git temp projects with `package.json`, `src/cli.ts`, and `test/cli.test.ts` produce non-empty entrypoints, modules, tests, verification commands, and deterministic cap risks when caps are exceeded.
  - Verification: Add/run focused command tests for non-Git first scan and cap/truncation behavior in `test/core-commands.test.ts`.

- [x] T003: Implement fingerprinting, preservation, and changed detection
  - Files: `src/core/codebase-index.ts`, `test/core-commands.test.ts`
  - Action: Add streaming SHA-256 for indexed files, oversized-file fingerprint skips, fingerprint removal for no-longer-indexed paths, semantic-field preservation for valid still-existing entries, reserved-risk replacement, `staleFiles`, `changed`, and stable generated output.
  - Acceptance: Re-running without changes reports unchanged bytes; editing an indexed file changes only the relevant deterministic data and reports that file stale; removed paths lose fingerprints.
  - Verification: Add/run focused tests for idempotent second scan and edited-file refresh.

## Wave 2 - Scan command and prompt integration

- [x] T004: Replace scan refresh logic with the builder state machine
  - Files: `src/core/commands.ts`, `src/core/codebase-index.ts`, `test/core-commands.test.ts`
  - Action: Make every `scan` read/validate the existing index, discard preservation on hard validation errors, keep `SW106` non-blocking, call `buildCodebaseIndex()`, write only when missing/changed/forced, and return `indexUpdated`, `staleFiles`, `scannedFiles`, `indexedFiles`, and `truncated` in JSON output.
  - Acceptance: Plain `scan --json` creates, refreshes, or no-ops the deterministic index without requiring `--refresh`; `scan --refresh` follows the same command-owned path.
  - Verification: Add/run focused command tests for first scan, idempotent scan, changed-file scan, invalid-index rebuild, and refresh compatibility.

- [x] T005: Rewrite the scan prompt contract
  - Files: `src/core/prompts.ts`, `src/core/commands.ts`, `src/runtime/omp/prompts.ts`, `test/core-prompts.test.ts`
  - Action: Pass deterministic index state into prompt rendering, show concise summary/validation/stale/truncation details, remove all instructions to edit `codebase-index.json` fingerprints, and leave OMP-specific parallel scout wording only in the OMP adapter.
  - Acceptance: Core prompts ask for semantic prose review only and contain no `## Current fingerprints` or manual checksum instructions; OMP prompt behavior remains isolated.
  - Verification: Add/run focused prompt tests covering no manual fingerprints, runtime-neutral core wording, and preserved OMP scout guidance.

## Wave 3 - Regression coverage

- [x] T006: Update command tests for command-owned indexing
  - Files: `test/core-commands.test.ts`
  - Action: Replace old refresh expectations with tests for non-Git first scan, second-scan no-op bytes, edited-file fingerprint update, `--refresh` compatibility, `--force` rewrite behavior, and `--map` compatibility without separate index ownership.
  - Acceptance: Tests prove the command writes deterministic fingerprints itself and never depends on agent-authored fingerprint JSON.
  - Verification: Run `bun test test/core-commands.test.ts`.

- [x] T007: Update validator and prompt boundary tests
  - Files: `test/core-validators.test.ts`, `test/core-prompts.test.ts`
  - Action: Align validator expectations with shared `CodebaseIndex` ownership and hard-error versus `SW106` preservation behavior; update prompt assertions for the semantic-prose-only contract.
  - Acceptance: Tests cover hard validation rebuild inputs, missing-file warning preservation, no core OMP wording, and no manual fingerprint instructions.
  - Verification: Run `bun test test/core-validators.test.ts test/core-prompts.test.ts`.

 - [x] T008: Run final targeted verification for the change
   - Files: `src/core/codebase-index.ts`, `src/core/commands.ts`, `src/core/prompts.ts`, `src/core/validators.ts`, `test/core-commands.test.ts`, `test/core-prompts.test.ts`, `test/core-validators.test.ts`
   - Action: Execute only the targeted verification suite for this change and fix any failures at the source.
   - Acceptance: The implemented scan flow satisfies all acceptance scenarios from `intent.md` without project-wide unrelated gates.
   - Verification: Run `bun test test/core-commands.test.ts test/core-validators.test.ts test/core-prompts.test.ts` and `bun run typecheck`.
