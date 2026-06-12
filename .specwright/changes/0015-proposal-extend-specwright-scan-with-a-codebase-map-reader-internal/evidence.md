# Evidence

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local evidence

- Current `commandScan` only ensures `.specwright/project/scan.md` and emits a bounded prompt to update `scan.md`, `tech-stack.md`, and `architecture.md`; it does not create `codebase-map.md` or `codebase-index.json` (`src/core/commands.ts:496-502`).
- `ensureProjectFiles` creates `charter.md`, `principles.md`, `glossary.md`, `tech-stack.md`, and `architecture.md` during init, so scan currently depends on init-created project files instead of ensuring the full project-intelligence set itself (`src/core/commands.ts:438-445`).
- `.specwright/project/` currently contains `architecture.md`, `scan.md`, `tech-stack.md`, `charter.md`, `glossary.md`, and `principles.md`; `codebase-map.md` and `codebase-index.json` are absent.
- `ParsedArgs` has `json`, `force`, and `printPrompt`, but no `map` or `refresh` fields (`src/core/commands.ts:48-64`). `parseArgs` handles `--json`, `--force`, and `--print-prompt`; it treats unknown `--map`/`--refresh` flags as `unknown` today (`src/core/commands.ts:121-204`).
- `CommandResult` already carries `filesCreated`, `filesUpdated`, and optional `prompt`; JSON-mode commands can return JSON in `summary` while preserving the same result shape (`src/core/types.ts:149-157`).
- Runtime-neutral prompt helpers live in `src/core/prompts.ts`; OMP-specific lifecycle/discuss wording lives in `src/runtime/omp/prompts.ts`. New map prompt wording should keep the same split (`src/core/prompts.ts:31-36`, `src/runtime/omp/prompts.ts:30-67`).
- Lifecycle prompts are assembled inline in `commands.ts`; research and plan have explicit read-first lists (`src/core/commands.ts:750-779`, `src/core/commands.ts:796-825`), execute embeds its read-first list in one prompt string (`src/core/commands.ts:961-979`), and handoff writes a read-first section into `handoff.md` (`src/core/commands.ts:1035-1055`). None reference project map artifacts today.
- Validation has reusable issue/report types with `error`/`warning` levels (`src/core/validators.ts:8-18`) and a safe-relative-path helper rejecting absolute and parent-directory paths (`src/core/validators.ts:56-63`). A command-scoped `codebase-index.json` validator can follow this pattern without becoming lifecycle-blocking.
- JSON helpers already provide safe JSON read and atomic JSON write (`src/core/json.ts:13-29`).
- `projectDir(cwd)` centralizes `.specwright/project` path construction (`src/core/paths.ts:16-18`).
- `renderHelp` still documents `specwright scan [--print-prompt]`, so the help text must add `--map`, `--refresh`, and JSON behavior (`src/core/commands.ts:1350-1352`).
- Existing tests cover command behavior, prompt content, OMP-vs-core prompt wording, and validation patterns in `test/core-commands.test.ts`, `test/core-prompts.test.ts`, and `test/core-validators.test.ts`; no scan-specific tests were found by search.

## Research attempts

- Spawned `specwright-researcher` via OMP `task` as required by the lifecycle prompt. The subagent lacked file-write tools, returned artifact contents, and Main applied the artifacts.
- No `web_search` was performed. The change is internal to Specwright and is determined by existing command architecture, prompt conventions, and validation patterns; external APIs, dependencies, standards, competitors, and recent behavior do not materially change the plan.

## Decisions supported

- Extend scan to ensure all five project-intelligence files: `scan.md`, `tech-stack.md`, `architecture.md`, `codebase-map.md`, and `codebase-index.json`.
- Add `--map`, `--refresh`, and `--json` to the scan CLI surface and help text.
- Make `scan --json` return a JSON command result rather than dumping only the index.
- Implement `scan --refresh` with deterministic stale detection using stored file mtimes/checksums.
- Add dedicated map prompt rendering with core runtime-neutral wording and OMP-specific adapter wording.
- Add command-scoped `codebase-index.json` validation warnings; do not fail unrelated lifecycle verification.
- Add pointer-only map references to later lifecycle prompts when map artifacts exist.
- Do not depend on Graphify, `.slim/codemap.json`, `codemap.md`, or `skill://codemap`.

