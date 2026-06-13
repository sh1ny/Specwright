# Evidence

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local evidence

- `commandScan()` writes a default empty `codebase-index.json` and only refreshes fingerprints when `--refresh` is supplied (`src/core/commands.ts:598-686`).
- `compareRefreshFingerprints()` limits fingerprint checks to paths already in `entrypoints`/`modules`/`tests`, so new files are never discovered by refresh (`src/core/commands.ts:440-509`).
- The current refresh prompt explicitly asks the agent to copy a JSON fingerprint object into `codebase-index.json` (`src/core/commands.ts:651-662`), which is the exact ownership boundary the change must remove.
- `validateCodebaseIndex()` distinguishes hard shape/path/fingerprint errors (`SW100`-`SW105`, `SW107`-`SW109`) from missing-file warnings (`SW106`) (`src/core/validators.ts:100-308`), supporting the rule that hard errors trigger a scratch rebuild while missing-file warnings are non-blocking.
- `computeFileFingerprint()` loads the entire file via `readFile()` before hashing (`src/core/json.ts:11-19`), motivating a streaming helper for the builder.
- `renderScanPrompt()` currently tells the agent to update `codebase-index.json` arrays and fingerprints (`src/core/prompts.ts:118-160`), so the prompt contract must change.
- Existing tests lock in the current refresh behavior: no index write and an agent-facing `## Current fingerprints` block (`test/core-commands.test.ts:2630-2734`). These expectations must change.
- Prompt tests assert that core scan prompts avoid OMP/scout wording and that OMP-specific scout guidance remains in `src/runtime/omp/prompts.ts` (`test/core-prompts.test.ts:358-440`).

## Research attempts

No external or scout research was required; local code and tests provide enough evidence. The `specwright-researcher` attempted to update the research artifacts directly, but its environment did not expose a file-write/edit tool, so it returned proposed contents for the lifecycle orchestrator to apply.

## Decisions supported

- Add a dedicated `src/core/codebase-index.ts` module for deterministic index building.
- Make plain `specwright scan` run the builder every time and write the index only when it changes.
- Remove the agent-facing fingerprint JSON block from the scan prompt.
- Preserve agent ownership of prose artifacts (`scan.md`, `tech-stack.md`, `architecture.md`, `codebase-map.md`) only.
- Update refresh and prompt tests to reflect command-owned fingerprints.

