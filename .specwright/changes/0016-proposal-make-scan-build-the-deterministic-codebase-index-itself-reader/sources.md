# Sources

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## URLs

None.

## Local references

- `src/core/codebase-index.ts:9-38` — `BuildCodebaseIndexOptions`/`BuildCodebaseIndexResult` include limits, stale files, counts, and truncation state.
- `src/core/codebase-index.ts:205-325` — Git-assisted streaming discovery and deterministic filesystem fallback reject unsafe paths before indexing.
- `src/core/codebase-index.ts:347-394` — package entrypoint candidate filtering rejects unsafe, excluded, and absent paths before insertion.
- `src/core/codebase-index.ts:418-455` — test association prefers same-directory/nearest source paths and avoids ambiguous basename fallback.
- `src/core/codebase-index.ts:505-776` — `buildCodebaseIndex()` command-owned deterministic index builder, cap accounting, fingerprinting, stale reporting, and stable changed detection.
- `src/core/commands.ts:517-627` — `commandScan()` ensures prose artifacts, builds/validates/writes the generated index, and renders scan prompts.
- `src/core/validators.ts:57-65` — `isSafeRelativePath()` rejects absolute, Windows-absolute, traversal, and control-character paths.
- `src/core/validators.ts:102-308` — `validateCodebaseIndex()` shape/path/fingerprint validation for existing and generated indexes.
- `src/core/prompts.ts:125-200` — `renderScanPrompt()` deterministic summary and command-owned/agent-owned scan boundary.
- `src/runtime/omp/prompts.ts:34-49` — `renderOmpScanPrompt()` OMP scout overlay with prose-only merge guidance.
- `test/core-commands.test.ts:2571-2596` — malformed index rebuild test asserts non-force parse recovery, `SW100`, and regenerated package/module data.
- `test/core-commands.test.ts:2987-3531` — `buildCodebaseIndex()` regression block covers discovery, caps, unsafe paths, fingerprints, association, and Git.
- `test/core-commands.test.ts:3576-3590` — `buildCodebaseIndex()` sort-order regression test asserts code-unit path ordering.
- `test/core-prompts.test.ts:370-570` — prompt ownership, stale-file rendering, and OMP prose-only merge regression tests.
- `test/core-validators.test.ts:156-377` — codebase-index validation tests.
- `package.json:9-13` — project scripts for targeted verification commands.

