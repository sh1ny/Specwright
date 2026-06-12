# Decisions

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Settled

- Ensure all project intelligence files from the scan path, not only `scan.md`.
- Make `scan --json` return a JSON command result for the prepared prompt rather than dumping only `codebase-index.json`.
- Implement `scan --refresh` as deterministic stale detection using file mtimes/checksums before prompt rendering.
- Keep index validation command-scoped and warning-oriented for scan flows.
- Feed map artifacts into later lifecycle prompts as pointer-only optional context.

## Deferred

- Graph database, embeddings, Graphify replacement, and query commands stay out of this change.
- Hard lifecycle enforcement of a fresh codebase map remains deferred.

## Ready state

- Ready for research.

