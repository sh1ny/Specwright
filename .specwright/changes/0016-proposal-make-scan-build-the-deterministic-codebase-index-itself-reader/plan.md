# Plan

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Decision

Plain `specwright scan` is the command-owned path for deterministic `codebase-index.json` creation and refresh. It must run the deterministic builder after ensuring project prose artifacts, write the index only when missing, changed, or forced, and report `indexUpdated`, `staleFiles`, `scannedFiles`, `indexedFiles`, and `truncated`. `scan --refresh` is compatibility spelling for the same path; `--map` may affect prompt focus but must not preserve a separate index-ownership path.

Pre-change evidence (current at research time): `evidence.md` records that `commandScan()` wrote an empty default index and refreshed only under `--refresh` (`src/core/commands.ts:598-686`), that the old refresh could not discover new files because it only checked already-indexed paths (`src/core/commands.ts:440-509`), and that the original prompt asked agents to paste fingerprint JSON (`src/core/commands.ts:651-662`).

Hard validation errors (`SW100`-`SW105`, `SW107`-`SW109`) mean rebuild from scratch without preserving semantic fields from the invalid object; `SW106` missing-file warnings remain non-blocking for preservation. Evidence: `evidence.md` notes `validateCodebaseIndex()` distinguishes those classes (`src/core/validators.ts:100-308`).

## Implementation plan

### Wave 1: Deterministic builder and type ownership

Add `src/core/codebase-index.ts` as the runtime-neutral owner of `CodebaseIndex`, `BuildCodebaseIndexOptions`, `BuildCodebaseIndexResult`, caps, reserved deterministic risk areas, discovery, classification, streaming SHA-256, preservation, and change detection. Remove duplicate local `CodebaseIndex` definitions from commands and validators; use a clean import-only cutover.

Discovery should try Git-assisted file listing when a Git worktree is available, but Git is only an optimization: failures or non-Git projects must fall back to deterministic filesystem recursion. Exclude `.git/`, `node_modules/`, `.specwright/cache/`, `.specwright/tmp/`, `.omp/`, `dist/`, `build/`, `.next/`, `coverage/`, and `target/`. Do not follow symlinked directories; skip symlinked files and record reserved risk `area: "symlink skipped"`. Sort all discovered and indexed paths deterministically.

Classify package scripts, obvious CLI/bin entrypoints, conventional source modules, test files, verification commands, and mechanically extractable command names. Cap defaults are `maxFilesScanned = 50000`, `maxIndexedFiles = 5000`, and `maxFingerprintBytesPerFile = 1048576`; cap hits record `area: "scan coverage"`, and oversized indexed files skip fingerprints with `area: "large file skipped"`.

Use streaming SHA-256 for fingerprints because `evidence.md` records the existing helper reads whole files into memory (`src/core/json.ts:11-19`). Recompute fingerprints for every indexed path, remove fingerprints for paths no longer indexed, preserve manual summaries/kinds/semantic fields only for still-existing paths when the existing index was not hard-invalid, and preserve manual risks except reserved deterministic areas.

### Wave 2: Scan command and prompt integration

Update `commandScan()` to read and validate any existing index, decide whether existing semantic fields are eligible for preservation, run `buildCodebaseIndex({ cwd, now, existing })` on every scan, and write `codebase-index.json` only when the builder reports changed, the file is missing, or `--force` is supplied. Derive `staleFiles` by comparing prior and rebuilt fingerprints and missing indexed paths. Retire the old path-only refresh comparison.

Update scan prompt inputs and `renderScanPrompt()` so core prompt text shows a concise deterministic summary, validation issues, stale files, and cap/truncation risks, while asking the agent only to review prose artifacts. Evidence: `evidence.md` records that `renderScanPrompt()` currently tells agents to update index arrays/fingerprints (`src/core/prompts.ts:118-160`) and that core prompt tests enforce runtime neutrality while OMP scout wording belongs in `src/runtime/omp/prompts.ts`.

### Wave 3: Tests and verification

Update command tests for first non-Git scan, idempotent second scan, edited-file refresh through plain scan, hard-invalid index rebuild, cap/truncation risk, and `--refresh` no longer showing `## Current fingerprints`. Add a Git-worktree discovery case that proves tracked and untracked files are indexed while ignored files are excluded. Update prompt tests so core never asks for manual fingerprint JSON and OMP-only scout guidance remains isolated. Evidence: `evidence.md` records current tests that lock in old refresh behavior (`test/core-commands.test.ts:2630-2734`) and prompt boundary tests (`test/core-prompts.test.ts:358-440`).

## Risks

- Git-assisted discovery could hide non-Git regressions; keep fallback tests mandatory.
- Rebuilding hard-invalid indexes could discard useful prose; this is intentional for unsafe shapes/paths, while `SW106` remains preservable.
- Caps can omit files; deterministic `scan coverage` risks and JSON `truncated` make the omission observable.
