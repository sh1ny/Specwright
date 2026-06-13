# Research

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local findings

- `specwright scan` is implemented in `commandScan()` (`src/core/commands.ts:598-686`). It ensures prose project artifacts, writes a default empty `codebase-index.json`, validates the existing index, and only compares fingerprints when `--refresh` is supplied.
- The `--refresh` path uses `compareRefreshFingerprints()` (`src/core/commands.ts:440-509`), which only checks paths already listed in `entrypoints`/`modules`/`tests` and recomputes fingerprints with `computeFileFingerprint()` (`src/core/json.ts:11-19`). That helper currently reads the whole file into memory before hashing.
- When stale files exist, the prompt asks the agent to paste the exact fingerprint JSON object into `codebase-index.json` (`src/core/commands.ts:651-662`), which is the ownership boundary this change removes.
- `validateCodebaseIndex()` (`src/core/validators.ts:100-308`) checks version, required arrays, safe relative paths, missing-file warnings, and fingerprint shape (`SW100`-`SW109`). Hard shape/path/fingerprint errors can be distinguished from non-blocking `SW106` missing-file warnings.
- `renderScanPrompt()` (`src/core/prompts.ts:118-160`) currently instructs the agent to update `codebase-index.json` arrays and fingerprints, so the prompt contract must change.
- The `CodebaseIndex` type is duplicated locally in both `src/core/commands.ts` and `src/core/validators.ts`; there is no shared builder module today.
- Existing tests assume `--refresh` does not write the index and that the prompt contains `## Current fingerprints` (`test/core-commands.test.ts:2630-2734`). Prompt tests assert core scan prompts stay runtime-neutral and that OMP scout wording remains in `src/runtime/omp/prompts.ts` (`test/core-prompts.test.ts:358-440`).
- The `--map --force` test expects only map artifacts to be regenerated (`test/core-commands.test.ts:2583-2618`), but the current command always writes `codebase-index.json`, so this boundary will need to be clarified.

## External findings

None. All evidence is local; no online research was required.

## Implications

- A new `src/core/codebase-index.ts` module is needed to own the shared `CodebaseIndex` type, filesystem walker, file classifier, streaming SHA-256 fingerprint helper, and `buildCodebaseIndex()`.
- `commandScan()` should call the builder on every scan and write the index only when `changed`, missing, or `--force`.
- The scan prompt must drop the agent fingerprint JSON contract and instead surface a deterministic summary.
- Tests must be updated to expect command-owned fingerprints and no `## Current fingerprints` block.

