# Discussion

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Conversation notes

- Bounded local evidence:
  - `src/core/commands.ts:496-502` shows current `commandScan` creates only `.specwright/project/scan.md` and returns a prompt asking the agent to update `scan.md`, `tech-stack.md`, and `architecture.md`.
  - `src/core/commands.ts:438-445` shows `init` creates `tech-stack.md` and `architecture.md`, so `scan` currently depends on prior init-created project files instead of ensuring them itself.
  - `src/core/commands.ts:48-64` and `src/core/commands.ts:130-198` show the parser has `json`, `force`, and `printPrompt` flags but no scan-specific `--map`/`--refresh` handling yet.
  - `src/core/prompts.ts:31-33` and `src/runtime/omp/prompts.ts:30-32` already distinguish runtime-neutral versus OMP-specific scout retry wording, matching the proposal's core/OMP split.
  - `src/core/validators.ts` currently validates config/change artifacts; no `codebase-index.json` validator exists yet.

## Open questions

- None for discuss. Ready for research.

## Settled decisions

- `specwright scan` should ensure all project intelligence files exist: `scan.md`, `tech-stack.md`, `architecture.md`, `codebase-map.md`, and `codebase-index.json`.
- `specwright scan --json` should return the prepared prompt result as JSON, matching the command result shape used by other commands.
- `specwright scan --refresh` should perform a deterministic stale scan using mtimes/checksums before prompting.
- `codebase-index.json` validation should be command-scoped warnings in scan/map/json paths, not unrelated lifecycle failures.
- Later lifecycle prompts should use pointer-only references to map artifacts when present; they should not inline the map contents.

