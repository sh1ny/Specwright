# project-planning Specification

## Purpose
Defines how `specwright-roadmap` records architecture decisions, reviews the project baseline, and commits roadmap edits, so project-level planning never needs a manual rescue.

## Requirements

### Requirement: ADRs stay proposed until the review gate passes
Roadmap **init** SHALL write baseline ADRs, and **close** any superseding ADR, with `Status: proposed`. Each SHALL be changed to `Status: accepted` with the acceptance date only after the baseline review gate passes for the content being accepted. The architecture's in-force ADR index SHALL list only accepted ADRs. An accepted ADR SHALL NOT be edited once it is on main; a later decision change SHALL be a new superseding ADR.

#### Scenario: Baseline passes review
- **WHEN** init writes ADRs 0001-0004 and the baseline review returns `VERDICT: APPROVE`
- **THEN** the committed ADRs read `Status: accepted` with that day's date, the roadmap is written only after that, and no further review round runs because of the acceptance edit

#### Scenario: Review asks to change a decision
- **WHEN** the baseline review returns `VERDICT: REVISE` with a finding against ADR 0002
- **THEN** ADR 0002 is edited in place while it still reads `Status: proposed`, and no superseding ADR is created

#### Scenario: Close supersedes an accepted ADR
- **WHEN** close finds that the decision in ADR 0003, accepted and on main, no longer holds
- **THEN** close writes a new ADR with `Status: proposed` and `Supersedes: 0003`, reviews it as the baseline is reviewed, accepts it only after that gate passes, and leaves ADR 0003's file unchanged

### Requirement: Baseline review rounds follow the schema's escalation rule
The baseline review SHALL escalate to the user after 2 consecutive `VERDICT: REVISE` rounds, and SHALL have no lifetime round cap. A pass covers only the content reviewed: a later edit to strategy, architecture or ADRs voids it and SHALL get a new round. The acceptance edit (a reviewed ADR's status set to accepted with its date, plus its in-force index row) is part of passing and does not void it. A pass ends a run of REVISE rounds.

#### Scenario: Two consecutive revise verdicts
- **WHEN** rounds 1 and 2 of the baseline review both return `VERDICT: REVISE`
- **THEN** roadmap stops and asks the user, and writes no roadmap until the user decides (recorded as `VERDICT: USER_OVERRIDE` if they choose to proceed)

#### Scenario: Edit after a passing verdict
- **WHEN** round 2 approved the baseline and a PR fix round then edits `openspec/architecture.md`
- **THEN** a round 3 review of the edited content runs without asking the user, and a REVISE in round 3 alone does not escalate

### Requirement: Gap-closing roadmap edit is committed on the new change's branch
When roadmap **next** finds no planned change left but an exit criterion still fails, it SHALL leave the roadmap untouched until the branch gate has created the gap-closing change's branch. It SHALL then add the change to the roadmap and commit only the roadmap file by name on that branch, before any planning artifact commit. Main SHALL stay unchanged.

#### Scenario: Criterion fails with no change left
- **WHEN** every change of M1 is done, the agent-verified criterion "evals/pr-pair passes" fails, and the user accepts the proposed change `fix-pr-pair-suite`
- **THEN** branch `bugfix/fix-pr-pair-suite` holds a commit that changes only the roadmap file and adds `fix-pr-pair-suite` to M1, main has no new commit, and the branch gate did not stop on a dirty tree

#### Scenario: Branch gate stops
- **WHEN** the branch gate for the gap-closing change stops, for example because main is not clean
- **THEN** the roadmap file is unchanged and no roadmap commit exists on any branch
