# Research

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local findings

- CLI entry already funnels all argv through `runSpecwrightCommand`, so `config` should be implemented as another deterministic core command rather than a separate bin path (`src/cli.ts:2-10`, `src/core/commands.ts:518-542`).
- Current parser supports one command plus positional args and shared flags; `config get <key>` and `config set <key> <value>` can use `args.positionals` without adding new flag parsing (`src/core/commands.ts:39-49`, `src/core/commands.ts:95-146`).
- The typed config contract exactly covers the approved key list: `project.name`, `defaults.*`, `packs.*`, and `runtimes.omp.enabled` (`src/core/types.ts:21-41`).
- Existing persistence already provides defaulting, version rejection, and JSON writes. `loadConfig` deep-merges defaults and rejects unsupported versions; `saveConfig` delegates to `writeJsonFile`; `writeJsonFile` writes indented JSON with a temp file and rename (`src/core/state.ts:35-65`, `src/core/state.ts:79-80`, `src/core/json.ts:15-19`).
- OMP does not need a separate config implementation. The extension passes slash-command args into the same command runner, and `splitArgs` preserves quoted JSON array/object values such as `'["core"]'` as one positional (`src/runtime/omp/extension.ts:9-17`, `src/runtime/omp/args.ts:1-34`).
- Tests should follow existing Bun command tests with `mkdtemp`, fixed `now()`, direct `runSpecwrightCommand`, and disk assertions for `.specwright/config.json` (`test/core-commands.test.ts:1-50`, `test/core-init.test.ts:16-25`).

## External findings

- No external lookup was needed in `online=auto`: the feature is mechanically constrained by existing repo-local command dispatch, typed config, and JSON persistence. No dependency, standards, competitor behavior, or recent API behavior changes are needed to choose the implementation.

## Implications

- Implement a `commandConfig(ctx, args)` in `src/core/commands.ts`, register it in the dispatch switch, and add help text.
- Keep a small allowlisted key table so unknown paths fail before mutation.
- Validate and coerce by target key type only: strings for `project.name`, `defaults.pack`; enum values for `defaults.mode` and `defaults.onlineResearch`; finite positive integers for context/output budgets; string arrays for pack roots/enabled; boolean for `runtimes.omp.enabled`; JSON parsing only for array/object values.
- For `set`, load the current config, build a cloned updated config, validate the full resulting `SpecwrightConfig`, then call `saveConfig` once. On any parse/validation failure, return `fail(...)` before saving so the old file remains intact.
- `get` should print stable JSON for arrays/objects and primitive text for scalars unless `--json` behavior is explicitly added later.

