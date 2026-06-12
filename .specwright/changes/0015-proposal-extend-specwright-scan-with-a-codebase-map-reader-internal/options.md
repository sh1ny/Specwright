# Options

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Option 1 — In-place scan extension inside `commands.ts`

Add the new behavior directly to `commandScan` and nearby helpers.

- Extend `ParsedArgs` with `map?: boolean` and `refresh?: boolean`; parse `--map` and `--refresh` alongside existing `--json`, `--force`, and `--print-prompt`.
- Update `commandScan(ctx, args)` to ensure `scan.md`, `tech-stack.md`, `architecture.md`, `codebase-map.md`, and `codebase-index.json` exist.
- Default `specwright scan` prepares the existing scan prompt and ensures map artifacts exist.
- `scan --map` emits a map-focused prompt.
- `scan --refresh` reads `codebase-index.json`, compares stored mtime/checksum data with current files, and emits a stale-section patch prompt. If nothing is stale, return a no-op summary.
- `scan --json` returns a JSON command-result summary with created/updated files, prompt mode, warning list, and stale file list.
- Add `renderMapPrompt` to `src/core/prompts.ts` and `renderOmpMapPrompt` to `src/runtime/omp/prompts.ts`.
- Add `validateCodebaseIndex` returning warning issues and call it only from scan flows.
- Add pointer-only map references to research, plan, execute, and handoff prompts when map artifacts exist.

Tradeoff: smallest diff, but `commands.ts` is already large and would absorb scan-specific stale detection, index validation, and prompt branching.

## Option 2 — Extract a scan subsystem

Create a dedicated core scan module and keep `commands.ts` as dispatch glue.

- Add `src/core/scan.ts` with a public function such as `prepareScan(ctx, args)`.
- Move project-intelligence artifact bootstrap, map/index templates, stale detection, scan JSON summary, and scan-flow validation into that module.
- Keep parser and help text changes in `commands.ts`.
- Put runtime-neutral prompt rendering in `src/core/prompts.ts`; let `prepareScan` select the OMP prompt adapter when `ctx.runtime === "omp"`.
- Put index validation either in `src/core/validators.ts` if it should share `ValidationIssue`, or in a scan-local validator exported for tests.
- Add focused tests for `prepareScan`, stale detection, and index validation, plus command-level tests for parser/help/prompt wiring.

Tradeoff: one new module, but scan becomes testable and does not further enlarge the command engine.

## Recommendation

Choose Option 2.

`scan` is becoming a multi-mode project-intelligence subsystem, not a one-off command. Extracting it keeps the deterministic core easier to test and leaves room for later `scan --query` or workstream-scoped maps without turning `commands.ts` into a second framework. Keep the first extraction boring: one `scan.ts` module, no dependency on Graphify, no dependency on `skill://codemap`, and no compatibility shim for `.slim/codemap.json`.


## Final decision

The branch kept the in-place command implementation because the review fixes are localized to `commandScan`, prompt helpers, validators, JSON fingerprint I/O, and tests. Do not create `src/core/scan.ts` as part of this review-fix pass.
