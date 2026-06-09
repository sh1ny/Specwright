# Sources

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## URLs

- None. `online=auto` did not require external sources because local code defines the command surface, config schema, persistence helpers, and OMP argument behavior.

## Local references

- `src/cli.ts:2-10` — CLI argv entry calls `runSpecwrightCommand`.
- `src/core/commands.ts:39-49`, `src/core/commands.ts:95-146`, `src/core/commands.ts:518-550` — parsed arg shape, dispatch switch, and help text extension points.
- `src/core/types.ts:21-41` — `SpecwrightConfig` typed key surface.
- `src/core/state.ts:6-24`, `src/core/state.ts:35-65`, `src/core/state.ts:79-80` — defaults, config loading/merging/version checks, and save helper.
- `src/core/json.ts:4-19` — JSON read behavior and atomic indented JSON write helper.
- `src/runtime/omp/extension.ts:9-17`, `src/runtime/omp/args.ts:1-34` — OMP slash command forwards into core runner and preserves quoted JSON values.
- `test/core-commands.test.ts:1-50`, `test/core-init.test.ts:16-25` — command-result and config-file test patterns.

