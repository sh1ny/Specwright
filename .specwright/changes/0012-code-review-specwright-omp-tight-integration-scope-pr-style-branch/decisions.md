# Decisions

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Settled

- Carry all findings from `REVIEW-0011-OMP-INTEGRATION.md` into 0012 research/plan acceptance: HIGH runtime failures, MEDIUM test gaps/workflow artifact issues, and LOW state metadata cleanup.
- Use a two-baseline research matrix: frozen reviewed ref (`main...refactor/0011-specwright-omp-tight-integration-p`) plus current `bugfix/0012-code-review-specwright-omp-tight-int` branch.
- Choose direct non-mutating validation for passive OMP status refresh; UI refresh paths must not call mutating `verify --json`.
- Preserve user-owned `.omp` rule/agent files when an adapter marker is stale; rewrite them only under `--force` or explicit agent regeneration.
## Deferred

- Exact implementation shape for direct status validation is deferred to research/plan, but it must satisfy the non-mutating constraint.
- Exact evidence update for 0011 verification artifacts is deferred to research/plan, but the issue remains in scope.
## Ready state

- Ready for research after discuss artifacts validate and the discuss checkpoint is created.
