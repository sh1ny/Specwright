# Sources

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## URLs

- No external URLs were consulted. This is an internal Specwright CLI/runtime change, and local source evidence is sufficient for research.

## Local references

- `src/core/commands.ts` — command dispatch, `parseArgs`, `commandScan`, lifecycle prompt assembly, `ensureProjectFiles`, and `renderHelp`.
  - `ParsedArgs`: `src/core/commands.ts:48-64`
  - `parseArgs`: `src/core/commands.ts:121-204`
  - `ensureProjectFiles`: `src/core/commands.ts:438-445`
  - `commandScan`: `src/core/commands.ts:496-502`
  - `commandResearch` and `commandPlan`: `src/core/commands.ts:737-826`
  - `commandExecute`, `commandVerify`, `commandHandoff`: `src/core/commands.ts:961-1055`
  - `renderHelp`: `src/core/commands.ts:1350-1352`
- `src/core/types.ts` — `CommandContext`, `CommandResult`, and `PromptInput` types (`src/core/types.ts:143-171`).
- `src/core/prompts.ts` — runtime-neutral prompt fragments and discuss prompt (`src/core/prompts.ts:31-90`).
- `src/runtime/omp/prompts.ts` — OMP-specific lifecycle, retry, and discuss prompt wording (`src/runtime/omp/prompts.ts:30-67`).
- `src/core/validators.ts` — validation issue/report types and safe relative path helper (`src/core/validators.ts:8-18`, `src/core/validators.ts:56-63`).
- `src/core/json.ts` — `readJsonFile` and `writeJsonFile` (`src/core/json.ts:13-29`).
- `src/core/paths.ts` — `projectDir(cwd)` (`src/core/paths.ts:16-18`).
- `.specwright/project/` — current project artifact set; map/index artifacts are not present.
- `test/core-commands.test.ts`, `test/core-prompts.test.ts`, `test/core-validators.test.ts` — existing test conventions for commands, prompts, OMP/core prompt split, and validators.

