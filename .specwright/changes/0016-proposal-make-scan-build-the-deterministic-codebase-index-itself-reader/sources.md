# Sources

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## URLs

None.

## Local references

- `src/core/commands.ts:48-56` — `ParsedArgs` defines `--map` and `--refresh` scan flags.
- `src/core/commands.ts:1546-1548` — `renderHelp()` advertises `specwright scan [--map] [--refresh] [--force] [--json] [--print-prompt]`.
- `src/core/commands.ts:598-686` — `commandScan()` current scan flow.
- `src/core/commands.ts:440-509` — `compareRefreshFingerprints()` path-only refresh logic.
- `src/core/commands.ts:651-662` — agent-facing `## Current fingerprints` JSON block.
- `src/core/validators.ts:100-308` — `validateCodebaseIndex()` shape/path/fingerprint validation.
- `src/core/json.ts:11-19` — `computeFileFingerprint()` whole-file SHA-256 helper.
- `src/core/prompts.ts:118-160` — `renderScanPrompt()` mapping contract and fingerprint shape instruction.
- `src/runtime/omp/prompts.ts:55-75` — `renderOmpScanPrompt()` parallel scout overlay.
- `test/core-commands.test.ts:2550-2618` — `--force` and `--map --force` scan tests.
- `test/core-commands.test.ts:2630-2734` — `--refresh` fingerprint tests.
- `test/core-prompts.test.ts:358-440` — scan prompt runtime-neutrality and OMP wording tests.
- `test/core-validators.test.ts:230-333` — codebase-index validation tests.
- `src/core/paths.ts:12-14` — `projectDir()` layout.
- `src/core/git.ts:72-74` — `isGitWorktree()` for future git-assisted optimization.
- `package.json:9-13` — project scripts for verification commands.

