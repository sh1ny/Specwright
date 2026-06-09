# Tasks

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Wave 1 — Regression coverage

- [x] T001: Cover config command regression behavior
  - Files: `test/core-commands.test.ts`
  - Action: Add Bun tests for `specwright config get <key>` and `specwright config set <key> <value>` through `runSpecwrightCommand`, using `mkdtemp` and direct reads of `.specwright/config.json`.
  - Acceptance: Tests cover scalar get, string set, enum set, positive integer set, boolean set, JSON string-array set, unknown key rejection, malformed array JSON rejection, wrong type rejection, missing args, extra args, and proof that invalid `set` leaves the previous config unchanged.
  - Verification: Run `bun test test/core-commands.test.ts`.

## Wave 2 — Core command implementation

- [x] T002: Add typed config key descriptors
  - Files: `src/core/commands.ts`
  - Action: Add a local descriptor table for the approved keys only, with getter, immutable setter, parser, and formatter behavior for string, enum, positive integer, string-array, and boolean values.
  - Acceptance: No descriptor exists for unknown paths; array values parse only from JSON arrays of strings; enum and boolean values accept only the approved literals; integer values reject non-integers, zero, negatives, `NaN`, and infinities.
  - Verification: Run `bun test test/core-commands.test.ts`.

- [x] T003: Register config get and set command
  - Files: `src/core/commands.ts`
  - Action: Add `commandConfig(ctx, args)`, dispatch `case "config"`, and update `renderHelp()` with `specwright config get <key>` and `specwright config set <key> <value>`.
  - Acceptance: `get` loads config through `loadConfig`; `set` loads config, applies one validated descriptor update, saves through `saveConfig`, returns clear summaries, and returns failures before save for invalid input.
  - Verification: Run `bun test test/core-commands.test.ts`.

## Wave 3 — Integration guard

- [x] T004: Verify OMP argument compatibility
  - Files: `test/omp-extension.test.ts` if existing coverage is insufficient; otherwise no production file changes.
  - Action: Ensure quoted JSON values passed through the OMP command path reach the shared runner as one positional argument, using the existing extension/split-args behavior.
  - Acceptance: `/specwright config set packs.enabled '["core"]'` remains representable through OMP without a separate implementation path.
  - Verification: Run `bun test test/omp-extension.test.ts` if the test file changes; otherwise cite existing `src/runtime/omp/extension.ts` and `src/runtime/omp/args.ts` evidence in the task result.

## Wave 4 — Final verification

- [ ] T005: Run focused feature checks
  - Files: `src/core/commands.ts`, `test/core-commands.test.ts`, and `test/omp-extension.test.ts` if changed.
  - Action: Run the focused tests covering all modified behavior and fix any failures at source.
  - Acceptance: Config command tests pass, OMP coverage passes if changed, and no unsupported config key can be read or written.
  - Verification: Run `bun test test/core-commands.test.ts` plus `bun test test/omp-extension.test.ts` if touched.

