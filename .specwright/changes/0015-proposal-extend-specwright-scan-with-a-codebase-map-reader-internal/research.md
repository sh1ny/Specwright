# Research

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local findings

`specwright scan` is currently a thin project-scan bootstrap. It guarantees `.specwright/project/scan.md` exists and returns a prompt asking the receiving agent to update `scan.md`, `tech-stack.md`, and `architecture.md` (`src/core/commands.ts:496-502`). It does not create `codebase-map.md` or `codebase-index.json`, and the argument parser has no `--map` or `--refresh` support (`src/core/commands.ts:48-64`, `src/core/commands.ts:121-204`).

The repo already has the seams needed for the change:

- Project artifact pathing is centralized through `projectDir(cwd)` (`src/core/paths.ts:16-18`).
- JSON I/O is available through `readJsonFile` and atomic `writeJsonFile` (`src/core/json.ts:13-29`).
- Command results already carry `filesCreated`, `filesUpdated`, and optional `prompt`, which supports JSON command-result output without inventing a new surface (`src/core/types.ts:149-157`).
- Runtime-neutral prompt helpers live in `src/core/prompts.ts`, while OMP-specific wording lives in `src/runtime/omp/prompts.ts`; the map prompt should follow this boundary.
- Validation already models warnings and safe relative paths (`src/core/validators.ts:8-18`, `src/core/validators.ts:56-63`), which fits command-scoped warnings for `codebase-index.json`.
- Lifecycle prompts have explicit read-first sections that can receive pointer-only map references without inlining map contents (`src/core/commands.ts:750-779`, `src/core/commands.ts:796-825`, `src/core/commands.ts:961-979`, `src/core/commands.ts:1035-1055`).

Existing tests cover the necessary patterns but not scan behavior directly. New tests should cover artifact creation, scan flag parsing, prompt content, JSON output shape, refresh stale/no-stale behavior, command-scoped validation warnings, and pointer-only lifecycle references.

## External findings

None. `online=auto` did not require web search because this change is internal to Specwright and not driven by external APIs, dependencies, standards, competitors, or recent behavior.

## Implications

The implementation can stay small and deterministic:

1. Keep final artifacts under `.specwright/project/`: `codebase-map.md` and `codebase-index.json`.
2. Implement native stale detection using stored file mtimes/checksums; do not call Graphify, a skill, or an external map generator.
3. Keep `codebase-index.json` validation warning-only and command-scoped to scan flows.
4. Add runtime-neutral core prompt wording plus an OMP-specific adapter variant for scout/parallel guidance.
5. Feed later lifecycle prompts with artifact pointers only, preserving the context-budget goal.

