# Handoff

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Goal

Ship the review fixes for the scan/codebase-map feature: scoped map writes, safe refresh prompts, parseable JSON output, hardened index validation, and aligned artifacts.

## Read first

- `src/core/commands.ts`
- `src/core/prompts.ts`
- `src/core/validators.ts`
- `src/core/json.ts`
- `test/core-commands.test.ts`
- `test/core-prompts.test.ts`
- `test/core-validators.test.ts`
- `test/omp-extension.test.ts`

## Current state

PASS after focused verification. Full project gates are recorded in `verify.md`.

## Constraints

- Map-only scan scope must not create or rewrite `scan.md`, `tech-stack.md`, or `architecture.md`.
- `scan --refresh` must not rewrite `codebase-index.json` solely because it computed fresh fingerprints.
- Core scan prompts must remain runtime-neutral; OMP-specific map guidance belongs only in `src/runtime/omp/prompts.ts`.

## Acceptance

The implementation and tests cover map-only artifact scoping, `scan --json` payload shape, validation-before-refresh behavior, malformed index/fingerprint handling, directory/non-file warnings, and map-only retry targets.

## Next task

Merge/review only.
