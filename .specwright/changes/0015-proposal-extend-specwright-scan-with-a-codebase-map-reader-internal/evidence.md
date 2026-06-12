# Evidence

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local evidence

- Pre-change `commandScan` on main only ensured `.specwright/project/scan.md` and emitted a bounded prompt to update `scan.md`, `tech-stack.md`, and `architecture.md`; it did not create `codebase-map.md` or `codebase-index.json` (`src/core/commands.ts` on main).
- Pre-change `ParsedArgs` had `json`, `force`, and `printPrompt`, but no `map` or `refresh` fields; `parseArgs` treated unknown `--map`/`--refresh` flags as `unknown` on main.
- Current `commandScan` scopes artifact writes: default scan ensures `scan.md`, `tech-stack.md`, `architecture.md`, `codebase-map.md`, and `codebase-index.json`; `scan --map` ensures only `codebase-map.md` and `codebase-index.json` (`src/core/commands.ts:598-646`).
- `writeIfMissing` records pre-write existence before writing, so forced creation and forced updates report accurate `filesCreated`/`filesUpdated` values (`src/core/commands.ts:406-413`).
- `scan --json` now serializes `summary`, `map`, `refresh`, `filesCreated`, `filesUpdated`, `validation`, optional `refreshResult`, and `prompt` in `CommandResult.summary` while preserving the existing `CommandResult` shape (`src/core/commands.ts:673-686`; `src/core/types.ts:149-157`).
- Refresh validation now runs before fingerprint traversal; invalid indexes produce a skipped-refresh prompt instead of traversal crashes (`src/core/commands.ts:648-668`; `src/core/validators.ts:111-305`).
- Refresh no longer writes new fingerprints immediately. Stale refresh prompts include a current-fingerprint JSON patch that the mapping agent applies after updating map sections (`src/core/commands.ts:656-663`).
- Directory and non-file paths are warnings, not crashes: `validateCodebaseIndex` stats listed entry/module/test paths and emits `SW106` for non-file paths (`src/core/validators.ts:174-187`).
- `computeFileFingerprint` returns `undefined` for directories and treats `EISDIR` like missing/non-traversable paths, preserving refresh execution when a tracked path is a directory (`src/core/json.ts:11-23`).
- Map-only prompts record retry attempts in `.specwright/project/codebase-map.md` rather than `.specwright/project/scan.md`, preserving map-only scope (`src/core/prompts.ts:35-41`, `src/core/prompts.ts:110-152`).

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

