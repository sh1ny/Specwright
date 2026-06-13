# Decisions

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Settled

- Keep `--map` as a focused prose-artifact compatibility mode; do not maintain a separate deterministic index path.
- On hard `codebase-index.json` validation errors, rebuild deterministic index data only and do not preserve semantic fields from the invalid object.
- Use git-assisted discovery when available, backed by deterministic filesystem fallback for projects without Git.
- Prompts must never ask agents to author, paste, or hand-edit fingerprints.
- Preserve the core/OMP prompt boundary: core scan prompt remains runtime-neutral; OMP-specific scout guidance stays in `src/runtime/omp/prompts.ts`.

## Deferred

- Whether to remove the `--map` flag entirely in a later breaking cleanup.
- Whether to make caps configurable through project config.

## Ready state

- Current state: follow-up review remediation is complete after verification; no research-phase decisions remain open.

