# Evidence

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local evidence

- `src/cli.ts:2-10` imports `runSpecwrightCommand`/`renderHelp`, slices `process.argv`, renders help for empty/`--help`, and delegates all other CLI behavior to the core command runner.
- `src/core/commands.ts:39-49` defines `ParsedArgs` as one command, positional args, and shared flags; `src/core/commands.ts:95-146` parses known flags and leaves non-flag args in `positionals`.
- `src/core/commands.ts:518-542` dispatches by `args.command`; no `config` command exists yet, so the change has a single core registration point. `src/core/commands.ts:548-550` contains the help text to update.
- `src/core/types.ts:21-41` defines `SpecwrightConfig` with only the approved key families: project, defaults, packs, and runtimes.omp.
- `src/core/state.ts:6-24` defines defaults, including `maxContextFiles: 6`, `maxOutputWords: 1200`, pack roots/enabled, and OMP enabled. `src/core/state.ts:35-65` loads config with version check and default merge. `src/core/state.ts:79-80` saves through `writeJsonFile`.
- `src/core/json.ts:15-19` creates the parent directory, writes `JSON.stringify(value, null, 2) + "\n"` to a pid-scoped temp path, then renames it into place.
- `src/runtime/omp/extension.ts:9-17` registers `/specwright` once and invokes the same command runner. `src/runtime/omp/args.ts:1-34` strips shell-style quotes while preserving quoted JSON as one arg.
- `test/core-commands.test.ts:1-50` shows direct command-runner tests for malformed and invalid inputs. `test/core-init.test.ts:16-25` shows disk assertions for generated `.specwright/config.json`.
- LSP status: TypeScript language server was ready; `symbols` on `src/core/commands.ts` confirmed command functions, parser, dispatch, and help symbols.

## Research attempts

- Read the requested six change artifacts first.
- Ran read-only `explore` scout `ConfigScout`; it completed successfully and reported the same local implementation points. No retry was needed.
- Used repository `search`, targeted `read`, and LSP `symbols`; no project-wide commands were run.
- External research skipped under `online=auto` because local implementation constraints fully answer the research questions.

## Decisions supported

- Reuse existing `.specwright/config.json` storage, `SpecwrightConfig`, `loadConfig`, `saveConfig`, and `writeJsonFile`.
- Add a core `config` subcommand rather than a CLI-only or OMP-only path.
- Use an explicit allowlist of typed existing keys; reject unknown keys.
- Parse arrays/objects from JSON for `packs.roots` and `packs.enabled`; reject malformed JSON and wrong element types before saving.
- Preserve deterministic behavior and zero new runtime dependencies.

