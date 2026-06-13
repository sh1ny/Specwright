# Handoff

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Goal

Make `specwright scan` build, validate, and own `.specwright/project/codebase-index.json` deterministically while agents edit only prose scan artifacts.

## Read first

- `src/core/codebase-index.ts`
- `src/core/commands.ts`
- `src/core/prompts.ts`
- `src/runtime/omp/prompts.ts`
- `test/core-commands.test.ts`
- `test/core-prompts.test.ts`
- `.specwright/changes/0016-proposal-make-scan-build-the-deterministic-codebase-index-itself-reader/verify.md`

## Current state

Review remediation is implemented and verified. `buildCodebaseIndex()` filters unsafe/excluded package entrypoints, counts associated tests against the indexed-file cap, avoids ambiguous basename fallback, tolerates disappearing files during fingerprinting, and reports deleted previously indexed files as stale. `commandScan()` validates generated indexes before writing and fails closed on generated validation errors. Core and OMP scan prompts keep `codebase-index.json` command-owned.

## Constraints

- Do not make `codebase-index.json` agent-owned.
- Do not add compatibility shims or alternate scan index paths.
- Preserve `--map` as focused prose-artifact compatibility mode while using the same deterministic index generation as plain scan.
- Keep OMP scout guidance in `src/runtime/omp/prompts.ts`, not in core prompts.

## Acceptance

- Generated indexes validate before write.
- Unsafe/excluded package paths are absent.
- Associated tests obey caps.
- Deleted indexed files are reported stale.
- Prompts never make `codebase-index.json` agent-owned.
- Artifacts match implemented behavior.

## Next task

No remaining implementation task; ready for final completion/merge after review findings are addressed.

