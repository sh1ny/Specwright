# Agent Handoff: 0015

## Goal

# Intent

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">
## Goal

Extend `specwright scan` with file-backed codebase mapping and safe refresh prompts.

## Users

Agents and operators preparing bounded, durable project intelligence before planning or handoff.

## Non-goals

Graph databases, embeddings, whole-repo eager reads, and mandatory fresh-map enforcement.

</frozen-after-approval>

## Approval notes
### Source request
@localdocs/SCAN-CODEBASE-MAP-PROPOSAL.md
### Expanded request
# Proposal: Extend `specwright scan` with a Codebase Map

## Reader

Internal Specwright maintainer implementing the next scan increment.

## Post-read action

Implement a lightweight codebase mapping flow that makes `specwright scan` useful as project intelligence, not just a prompt stub.

## Problem

`specwright scan` currently prepares a bounded prompt and a single project scan artifact. That is enough for an agent to write prose notes, but it does not leave durable, structured codebase intelligence that later phases can reuse.

GSD's comparable capability is larger: codebase mapping, intel files, graphify integration, and queryable project memory. Specwright does not need all of that now. It needs the smallest useful map that improves future planning and handoff quality.

## Decision

Extend `specwright scan` so it produces a lightweight codebase map under project artifacts.

The map should answer:

- What are the major subsystems?
- Where are the entrypoints?
- What files define the CLI/runtime/core boundaries?
- What test files cover which modules?
- What build, test, and validation commands exist?
- What conventions should future agents follow?
- What areas are risky or under-documented?

This should stay file-based, reviewable, and cheap. Do not build a graph database. Do not clone Graphify.

## Proposed user interface

Keep the existing default command:

```bash
specwright scan
```

Change its behavior to prepare/update both the existing project scan and a codebase map prompt.

Add focused modes:

```bash
specwright scan --map
specwright scan --refresh
specwright scan --json
```

Semantics:

- `specwright scan` prepares the normal scan prompt and ensures map artifacts exist.
- `specwright scan --map` focuses only on codebase mapping.
- `specwright scan --refresh` asks the agent to update stale sections instead of rewriting everything.
- `specwright scan --json` prints a machine-readable summary of known project intelligence.

## Proposed artifacts

Add these project artifacts:

```txt
.specwright/project/scan.md
.specwright/project/tech-stack.md
.specwright/project/architecture.md
.specwright/project/codebase-map.md
.specwright/project/codebase-index.json
```

### `codebase-map.md`

Human-readable. Sections:

```md
# Codebase Map

## Entry points

## Core modules

## Runtime adapters

## Data and state artifacts

## Command surface

## Test surface

## Build and verification commands

## Conventions

## Known risks and gaps

## Open questions
```

### `codebase-index.json`

Machine-readable. Minimal schema:

```json
{
  "version": 1,
  "generatedAt": "ISO-8601",
  "entrypoints": [
    { "path": "bin/specwright.mjs", "kind": "cli-bin", "summary": "Node wrapper that invokes the CLI runtime." }
  ],
  "modules": [
    { "path": "src/core/commands.ts", "kind": "core", "summary": "Command dispatch and workflow orchestration.", "tests": ["test/core-commands.test.ts"] }
  ],
  "commands": [
    { "name": "scan", "summary": "Prepare project intelligence artifacts." }
  ],
  "verification": [
    { "command": "bun test", "purpose": "Run project tests." }
  ],
  "risks": [
    { "area": "runtime support", "summary": "Current runtime support is OMP-first." }
  ]
}
```

Keep the schema intentionally small. It should support status displays, handoff prompts, and future query commands without becoming a second source of truth for the whole repository.

## Implementation shape

### 1. Add artifact creation

Update scan initialization to create missing map artifacts alongside the existing scan artifacts.

Rules:

- Do not overwrite existing map artifacts unless `--force` is supplied.
- `--refresh` should instruct the agent to patch stale sections, not regenerate from scratch.
- Existing `scan.md`, `tech-stack.md`, and `architecture.md` remain canonical project notes.

### 2. Add a scan prompt variant

Create a dedicated map prompt renderer.

The prompt should instruct the receiving agent to:

1. Use file discovery to identify top-level structure.
2. Use search/LSP for entrypoints, exported commands, runtime adapters, config defaults, validators, and tests.
3. Read only relevant sections.
4. Update `codebase-map.md` and `codebase-index.json`.
5. Preserve existing confirmed facts unless contradicted by current code.
6. Record uncertainty in `Open questions`, not as fact.

### 3. Use bounded decomposition for larger repositories

For small repositories, one agent can map the repo.

For larger repositories, the prompt should tell the receiver to split mapping by subsystem:

- CLI and command kernel
- state/config/validators
- runtime adapters
- packs/templates/agents
- tests

The map prompt should prefer parallel scout agents in OMP when available, but the core prompt must remain runtime-neutral. OMP-specific routing belongs in the OMP prompt adapter.

### 4. Add JSON validation

Add a validator for `codebase-index.json`.

Minimum checks:

- valid JSON
- `version` is `1`
- paths are relative
- no path traversal
- arrays contain objects with required fields
- every listed test path exists if present

This validator should warn on stale or missing files, not fail unrelated lifecycle work until scan artifacts are explicitly required by a workflow.

### 5. Feed map into later prompts

After scan has produced a map, lifecycle prompts should include it in bounded read-first context where useful:

- `research`: include codebase map as optional context.
- `plan`: include codebase map when selecting implementation files.
- `execute`: include only task-relevant excerpts or point to the map as reference.
- `handoff`: include codebase map when no specific implementation files are known.

Do not blindly add the full map to every prompt. The map exists to reduce context load, not increase it.

## Acceptance criteria

- `specwright scan --map` ensures `codebase-map.md` and `codebase-index.json` exist; without `--force` it preserves existing map artifacts and emits an update prompt, and with `--force` it regenerates only those two map artifacts.
- Existing scan behavior still works.
- The map prompt is runtime-neutral in core code.
- OMP-specific instructions live in the OMP prompt adapter.
- `codebase-index.json` is validated for shape and safe relative paths.
- Later lifecycle prompts can reference the map without eagerly loading unrelated content.
- Tests cover artifact creation, map-only force scoping, prompt contents, scan JSON shape, index validation, directory paths, malformed fingerprints, and `--refresh` no-premature-persist behavior.

## Non-goals

- No graph database.
- No semantic embedding store.
- No full Graphify replacement.
- No automatic whole-repo reads.
- No permanent requirement that every change must have a fresh codebase map.

## Future extensions

1. `specwright scan --query <question>` over `codebase-index.json`.
2. `specwright scan --graphify` handoff to the external Graphify workflow.
3. Workstream-scoped maps once Specwright supports workstreams.
4. Runtime-specific map sections for non-OMP adapters.

### Discuss-settled intent

- Extend `specwright scan` into a lightweight project-intelligence entrypoint that prepares both human-readable scan notes and a durable codebase map.
- Keep the feature file-based and reviewable: project notes remain Markdown, machine-readable intelligence lives in `codebase-index.json`, and lifecycle prompts reference map artifacts by path instead of loading them wholesale.
- Add scan-specific modes for focused mapping, deterministic refresh/staleness handling, and JSON command-result output without creating a graph database or embedding store.

## Read first

- .specwright/changes/0015-proposal-extend-specwright-scan-with-a-codebase-map-reader-internal/intent.md
- .specwright/changes/0015-proposal-extend-specwright-scan-with-a-codebase-map-reader-internal/evidence.md
- .specwright/changes/0015-proposal-extend-specwright-scan-with-a-codebase-map-reader-internal/tasks.md
- .specwright/changes/0015-proposal-extend-specwright-scan-with-a-codebase-map-reader-internal/verify.md

## Current state

status=verifying; step=verify

## Constraints

See intent.md and evidence.md.

## Acceptance

# Verification

## Result

PASS

## Issues

No issues.

## Observed output

Command: `bun test test/core-commands.test.ts -t "scan --map" && bun test test/core-commands.test.ts -t "scan --json" && bun test test/core-commands.test.ts -t "scan --refresh" && bun test test/core-prompts.test.ts -t "renderScanPrompt" && bun test test/omp-extension.test.ts -t "scan prompt" && bun test test/core-validators.test.ts -t "validateCodebaseIndex"`

Output:

```txt
Test Results:
   PASS: 4 passed
```

Command: `bun test test/core-commands.test.ts test/core-prompts.test.ts test/omp-extension.test.ts test/core-validators.test.ts`

Output:

```txt
Test Results:
   PASS: 214 passed
```


## Next task

No incomplete tasks.

## Evidence

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


