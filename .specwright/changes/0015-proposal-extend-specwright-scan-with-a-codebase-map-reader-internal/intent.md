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