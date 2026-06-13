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
- `test/core-commands.test.ts:2571-2623,2812-2864` — invalid-index rebuild tests cover malformed JSON, falsy roots, and invalid-shape rebuilds from scratch.
- `test/core-commands.test.ts:3004-3745` — `buildCodebaseIndex()` regression block covering non-Git discovery, caps, unsafe paths, fingerprints, test association, Git discovery/output-cap/unsafe, symlink bounds, oversized files, and sort order.
- `test/core-commands.test.ts:3172-3195` — stale file detection refreshes fingerprints when source files change.
- `test/core-commands.test.ts:3303-3335` — package entrypoint filtering rejects unsafe and excluded paths.
- `test/core-commands.test.ts:3444-3491` — test association prefers nearest paths and avoids ambiguous basename fallback.
- `test/core-commands.test.ts:3494-3559,3599-3617` — large-file risk tests cover oversized files, stale oversized transitions, non-repeated reporting, and indexed-only oversized filtering.
- `test/core-commands.test.ts:3560-3582` — root test directories are classified as tests and linked to source modules.
- `test/core-commands.test.ts:3584-3597` — exact scan cap does not mark `truncated` when the count equals the cap.
- `test/core-commands.test.ts:3640-3659` — Git discovery includes tracked and untracked files while respecting `.gitignore`.
- `test/core-commands.test.ts:3661-3686` — Git discovery keeps results and records a scan-coverage risk when the Git output byte cap is exceeded.
- `test/core-commands.test.ts:3688-3703` — Git discovery skips unsafe paths before indexing.
- `test/core-commands.test.ts:3705-3729` — ignored root `package.json` is excluded from Git-derived package metadata.
- `test/core-commands.test.ts:3731-3745` — `buildCodebaseIndex()` sorts paths by code-unit order.
- `test/core-prompts.test.ts:370-572` — prompt ownership, stale-file rendering, and OMP prose-only merge regression tests.
- `test/core-validators.test.ts:156-404` — codebase-index validation tests.
- `package.json:9-13` — project scripts for targeted verification commands.

