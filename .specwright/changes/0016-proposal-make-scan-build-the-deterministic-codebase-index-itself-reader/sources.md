# Sources

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## URLs

None.

## Local references

- `src/core/codebase-index.ts:19-37` — `BuildCodebaseIndexOptions`/`BuildCodebaseIndexResult` include limits, stale files, counts, and truncation state.
- `src/core/codebase-index.ts:185-274` — Git-assisted discovery with exact NUL-separated path preservation and deterministic filesystem fallback.
- `src/core/codebase-index.ts:293-341` — package entrypoint candidate filtering rejects unsafe, excluded, and absent paths before insertion.
- `src/core/codebase-index.ts:373-402` — test association prefers same-directory/nearest source paths and avoids ambiguous basename fallback.
- `src/core/codebase-index.ts:454-715` — `buildCodebaseIndex()` command-owned deterministic index builder, cap accounting, fingerprinting, stale reporting, and stable changed detection.
- `src/core/commands.ts:517-624` — `commandScan()` ensures prose artifacts, builds/validates/writes the generated index, and renders scan prompts.
- `src/core/validators.ts:57-65` — `isSafeRelativePath()` rejects absolute, Windows-absolute, traversal, and control-character paths.
- `src/core/validators.ts:102-308` — `validateCodebaseIndex()` shape/path/fingerprint validation for existing and generated indexes.
- `src/core/prompts.ts:125-192` — `renderScanPrompt()` deterministic summary and command-owned/agent-owned scan boundary.
- `src/runtime/omp/prompts.ts:34-47` — `renderOmpScanPrompt()` OMP scout overlay with prose-only merge guidance.
- `test/core-commands.test.ts:2732-2784` — invalid index rebuild test asserts live package/module/fingerprint data.
- `test/core-commands.test.ts:3044-3137` — stale deletion, safe package entrypoints, associated-test cap, and ambiguous fallback regression tests.
- `test/core-prompts.test.ts:370-512` — prompt ownership and OMP prose-only merge regression tests.
- `test/core-validators.test.ts:230-333` — codebase-index validation tests.
- `package.json:9-13` — project scripts for targeted verification commands.

