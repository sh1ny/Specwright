# Plan

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Decision

Extend `specwright scan` into a bounded project-intelligence bootstrap. The command must ensure `.specwright/project/scan.md`, `tech-stack.md`, `architecture.md`, `codebase-map.md`, and `codebase-index.json` exist, because evidence shows current `commandScan` only ensures `scan.md` while init owns the other project notes (`.specwright/changes/0015-proposal-extend-specwright-scan-with-a-codebase-map-reader-internal/evidence.md`; `src/core/commands.ts:496-502`, `src/core/commands.ts:438-445`).

Add scan-only `--map`, `--refresh`, and existing `--json` behavior to the command surface. `--map` returns a focused map prompt, `--refresh` compares deterministic fingerprints before prompting, and `--json` serializes the prepared command result rather than dumping only the index. This uses existing `CommandResult` fields and parser/help seams cited in evidence (`src/core/types.ts:149-157`, `src/core/commands.ts:48-64`, `src/core/commands.ts:121-204`, `src/core/commands.ts:1350-1352`).

Keep the map file-based and small: `codebase-map.md` is the human source for sections named in intent, and `codebase-index.json` is schema version 1 with `generatedAt`, `sources` fingerprints, `entrypoints`, `modules`, `commands`, `verification`, and `risks`. Store only relative paths and concise summaries. Explicitly exclude query commands, graph databases, Graphify, `.planning/intel`, mapper-agent orchestration, `.slim/codemap.json`, `codemap.md`, and `skill://codemap` as supported by evidence.

## Implementation plan

1. Extend scan argument parsing and help so `--map` and `--refresh` are recognized, scoped to scan behavior, and compatible with `--json`, `--force`, and `--print-prompt`.
2. Update scan artifact creation through existing project pathing and JSON helpers (`projectDir`, `readJsonFile`, `writeJsonFile`) so missing map artifacts are created, existing artifacts are not overwritten unless `--force` is supplied, and result file lists stay accurate (`src/core/paths.ts:16-18`, `src/core/json.ts:13-29`).
3. Implement deterministic refresh by recording `mtimeMs`, size, and checksum for indexed source/test paths. `scan --refresh` recomputes those fingerprints, reports missing/stale entries, and asks the agent to patch stale sections instead of regenerating everything.
4. Add a runtime-neutral core map prompt that instructs bounded discovery, section-level Markdown updates, JSON index updates, preservation of confirmed facts, and uncertainty in `Open questions`. Keep OMP-specific scout/parallel wording only in the OMP adapter, matching the prompt split in evidence (`src/core/prompts.ts:31-36`, `src/runtime/omp/prompts.ts:30-67`).
5. Add a command-scoped `codebase-index.json` validator using existing validation issue/report patterns and safe-relative-path checks (`src/core/validators.ts:8-18`, `src/core/validators.ts:56-63`). Invalid shape or unsafe paths are scan-flow issues; stale or missing listed files/tests are warnings and must not block unrelated lifecycle work.
6. Add pointer-only map references to research, plan, execute, and handoff prompts when artifacts exist. Do not inline the full map; evidence shows these prompts already have explicit read-first insertion points (`src/core/commands.ts:750-779`, `src/core/commands.ts:796-825`, `src/core/commands.ts:961-979`, `src/core/commands.ts:1035-1055`).

## Risks

- Fingerprints only cover indexed paths, so unindexed new subsystems require normal scan discovery before refresh can detect them.
- Prompt wording can accidentally drift runtime-specific; tests must prove OMP-only scout language stays out of core prompts.
- `codebase-index.json` validation should be useful in scan flows without becoming a global lifecycle gate.
