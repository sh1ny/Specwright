# Constraints

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Product constraints

- `specwright scan` must ensure all project intelligence files exist: `.specwright/project/scan.md`, `tech-stack.md`, `architecture.md`, `codebase-map.md`, and `codebase-index.json`.
- `specwright scan --json` must return the prepared prompt result as JSON, consistent with existing command-result semantics.
- Later lifecycle prompts may reference the map artifacts by path when present, but must not eagerly inline full map contents.

## Technical constraints

- `scan --refresh` must use deterministic stale scanning based on mtimes/checksums before prompting.
- `codebase-index.json` validation must be command-scoped for scan/map/json flows and report warnings for stale or missing listed files instead of failing unrelated lifecycle verification.
- Core scan prompt behavior must remain runtime-neutral; OMP-specific scout/parallel wording belongs in the OMP prompt adapter.

## Open constraints

- None after discuss.

