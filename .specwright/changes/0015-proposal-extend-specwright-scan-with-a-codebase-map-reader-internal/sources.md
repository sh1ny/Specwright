# Sources

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## URLs

- No external URLs were consulted. This is an internal Specwright CLI/runtime change, and local source evidence is sufficient for research.

## Local references

- `src/core/commands.ts` — command dispatch, argument parsing, scan artifact scoping, refresh fingerprint comparison, JSON summary output, and help text.
  - `ParsedArgs`: `src/core/commands.ts:48-64`
  - `parseArgs`: `src/core/commands.ts:115-204`
  - `writeIfMissing`: `src/core/commands.ts:406-413`
  - `trackedPaths`: `src/core/commands.ts:440-469`
  - `compareRefreshFingerprints`: `src/core/commands.ts:480-510`
  - `commandScan`: `src/core/commands.ts:598-686`
  - `renderHelp`: `src/core/commands.ts:1537-1539`
- `src/core/types.ts` — `CommandResult` keeps JSON-capable output in `summary` plus `filesCreated`, `filesUpdated`, and optional `prompt` (`src/core/types.ts:149-157`).
- `src/core/prompts.ts` — runtime-neutral scan prompt and retry target logic.
  - `renderScanRetryClause`: `src/core/prompts.ts:35-41`
  - `renderScanPrompt`: `src/core/prompts.ts:110-152`
- `src/runtime/omp/prompts.ts` — `renderOmpScanPrompt` wraps the core scan prompt and appends OMP-only map guidance (`src/runtime/omp/prompts.ts:34-45`).
- `src/core/validators.ts` — codebase index path safety and shape validation.
  - `isSafeRelativePath`: `src/core/validators.ts:56-63`
  - `validateCodebaseIndex`: `src/core/validators.ts:111-305`
- `src/core/json.ts` — `FileFingerprint` and directory-safe `computeFileFingerprint` (`src/core/json.ts:5-23`).
- `src/core/paths.ts` — `projectDir(cwd)` (`src/core/paths.ts:16-18`).
- `test/core-commands.test.ts` — updated scan artifact, map-only, JSON, validation, and refresh no-premature-persist tests (`test/core-commands.test.ts:2470-2931`).
- `test/core-validators.test.ts` — updated codebase-index validator tests, including Windows absolute paths, directory warnings, and malformed fingerprints (`test/core-validators.test.ts:155-332`).
- `test/core-prompts.test.ts` — updated core scan prompt tests for retry targets and fingerprint contract (`test/core-prompts.test.ts:358-427`).
- `test/omp-extension.test.ts` — updated OMP scan prompt tests for inherited map retry targets and OMP-only guidance (`test/omp-extension.test.ts:1780-1810`).

