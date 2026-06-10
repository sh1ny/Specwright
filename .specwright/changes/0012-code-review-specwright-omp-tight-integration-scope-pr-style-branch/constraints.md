# Constraints

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Product constraints

- The change must address all review findings from the 0011 OMP integration PR-style review, not only the highest-severity runtime defects.
- Research and planning must preserve the distinction between the frozen reviewed ref and the current bugfix branch; already-fixed findings still need evidence and acceptance disposition.
- 0011 verification artifact correction is in scope because the review identified unevidenced manual OMP acceptance claims.
## Technical constraints

- Passive OMP status refresh must be non-mutating: no UI/session/turn refresh path may write `verify.md` or advance `.specwright/state.json` by invoking mutating verification commands.
- Status classification should use direct core readers/validators rather than `verify --json`.
- Stale adapter marker handling must not treat all existing `.omp` files as globally force-overwritable. Existing rule and agent files are preserved unless `--force` or explicit agent regeneration applies.
- The research artifact must include a finding matrix covering frozen reviewed ref status and current branch status for each finding.
## Open constraints

- None after discuss clarification.
