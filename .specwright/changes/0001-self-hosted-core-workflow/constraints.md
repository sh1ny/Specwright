# Constraints

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Product constraints

- OMP slash commands are the preferred interactive usage path.
- CLI commands remain useful for deterministic file/state operations and prompt printing.
- Change artifacts under `.specwright/changes/<id>-<slug>/` are the workflow source-of-truth.
- Every implementation step after planning should be task-scoped and verifiable.
- Human-owned intent must stay inside the frozen-after-approval block unless renegotiated.

## Technical constraints

- Bun/TypeScript stays the project runtime for this cut.
- Avoid runtime dependencies; use Bun/Node stdlib, JSON machine files, and Markdown human artifacts.
- Keep runtime-specific behavior under `src/runtime/omp/*`.
- Keep prompt rendering low-token: read only current step artifacts and explicitly listed files.
- Validators run before verification/handoff claims.
- OMP extension load must remain project-local through `.omp/extensions/specwright`.

## Open constraints

- Need a planning decision on whether to add a reliable OMP extension smoke test beyond the current fake-PI unit test.
- Need a planning decision on which command edge cases are worth hardening before broader dogfooding.

