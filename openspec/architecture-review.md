# Review

## Metadata

- **Round:** 5
- **Prior round:** round 4 APPROVE_WITH_CHANGES at 43ed3e8, changes applied and re-checked in 1f2b0ad; since then PR fix rounds 15–16 edited the files.
- **Reviewer:** cross-model CLI (codex)
- **Reviewed:** Clean checkout at `d6213f685be20d8d33686dc6554c89b74501ca64`; complete `openspec/strategy.md`, `openspec/architecture.md`, `openspec/roadmap.md`, prior `openspec/architecture-review.md`, and ADRs `0001`–`0006`; all six `skills/*/SKILL.md`, all four `skills/specwright-pr/scripts/*.sh`, their five reference files, `schemas/specwright/schema.yaml` and its five templates, all four agent definitions, both configuration templates, `README.md`, and `CONTRIBUTING.md`; complete `evals/pr-pair/test_skill_text.py` and `test_as_sh.py`, selected sections of `test_pr_pair.py`, `evals/fakes/gh.py`, and the git-workflow manifest, fixtures and grader; baseline diff from `43ed3e8`; tracking issues #31, #32 and #39. Verification included in-memory namespace and reviewer-evidence probes and five passing read-only skill-text tests. HEAD and the clean working tree were unchanged afterward. No files were modified.

## Findings

### Critical (blocking)

None.

### Moderate

**M1 — Cache filenames alias unrelated repositories and changes, breaking the stated ownership scope.**

The architecture describes feedback records as belonging to one change and watch tokens as belonging to one PR (`openspec/architecture.md:77`, `:78`). Both implementations concatenate identity fields with hyphens without preserving their boundaries:

- Watch: `skills/specwright-pr/scripts/pr-snapshot.sh:61`.
- Feedback: `skills/specwright-pr/scripts/pr-pair.sh:829`–`:833`.

The actual watch assignment gives both `acme-tools/widget#7` and `acme/tools-widget#7` the filename `acme-tools-widget-7`. The actual `record_path()` function gives those repositories’ respective `fix-login` changes the same filename, `acme-tools-widget-fix-login.json`. These were reproduced in memory with valid repository and change names.

Starting the second watcher replaces the first PR’s token. The first watcher exits 4 (`pr-snapshot.sh:325`), which the skill explicitly tells the caller to ignore as a takeover (`skills/specwright-pr/SKILL.md:118`). Monitoring therefore stops for an unrelated PR without a handover. An existing feedback record similarly blocks an unrelated change as `record_exists` (`pr-pair.sh:897`–`:898`), routing it into recovery for somebody else’s pass.

This requires no cleanup race or concurrent record creation. [#32](https://github.com/sh1ny/specwright/issues/32) currently tracks ownership races within one change; [#39](https://github.com/sh1ny/specwright/issues/39) tracks cleanup deleting a replacement token. Neither tracks namespace collisions.

**M2 — Missing push activity lets previous-head reviews satisfy current-head readiness, even with a fresh snapshot.**

The baseline records stale snapshot acceptance under #31, but omits stale reviewer evidence inside a correctly identified, fresh snapshot (`openspec/architecture.md:102`, `:117`; `openspec/roadmap.md:21`).

When push activity is unavailable, `prepare_cfg()` uses the head’s commit date as the report cutoff (`skills/specwright-pr/scripts/pr-snapshot.sh:280`–`:283`). Mira and other timestamp-based reviewers accept reports after that cutoff (`:198`–`:204`). A commit date can precede both a review of the previous head and publication of the new head.

Concrete sequence: head B was committed at 09:00, a reviewer reported on head A at 10:00, B was pushed at 11:00, and the watcher first observed B at 12:00 without finding its push activity. The fallback accepts A’s report because 10:00 exceeds B’s commit date.

An in-memory evaluation of the unmodified snapshot expression with this fallback configuration marked both a required generic reviewer and Mira `reported`. After their old summaries were dropped, the actual `readiness()` function returned `(True, [], False)`. Its required-reviewer check trusts `reported` (`skills/specwright-pr/scripts/pr-pair.sh:705`–`:707`), as does the skill’s ready condition (`skills/specwright-pr/SKILL.md:125`).

Consequently, watch can report a new head ready without its configured reviewer having reviewed it. Checking the snapshot’s PR number and head SHA alone will not fix this: [#31](https://github.com/sh1ny/specwright/issues/31) currently tracks mismatched snapshots, whereas this snapshot describes head B correctly.

### Suggestions

None.

## Verdict

VERDICT: APPROVE_WITH_CHANGES

The foundational decisions remain sound. Approval requires accurately recording and scheduling these additional failure cases. Their runtime fixes may remain in M1. No ADR text changes are required.

## Required Changes

1. In `openspec/architecture.md`, append to the feedback-record State ownership row: “Gap: its hyphenated filename can alias distinct repositories or changes (#32).” Append to the watch-token row: “Gap: its hyphenated filename can alias distinct repositories, so a watcher for another PR can take ownership (#39).” Add a Known gaps row: “Hyphenated cache filenames alias distinct repository/change identities, blocking unrelated feedback or stopping another PR’s watcher” with issues `#32, #39`.

2. Extend tracking issues #32 and #39 to include those namespace collisions. Require regression cases using `acme-tools/widget` and `acme/tools-widget`, with the same change name or PR number: feedback records must coexist independently, and starting either PR’s watcher must not displace the other. In `openspec/roadmap.md`, replace `#32 pass ownership` with `#32 pass ownership and collision-free feedback-record keys`; replace `#39 watch token race` with `#39 watch token race and collision-free watch keys`.

3. In `openspec/architecture.md`, add a Resource bounds and failure visibility row stating that Mira and other timestamp-based reviewers use commit time as their report cutoff when push activity is missing; an earlier-head report can therefore mark the current head `reported` in a fresh snapshot, with nobody detecting the missing review until its evidence is inspected. Reference #31. Expand the #31 Known gaps entry to: “Pair readiness accepts a snapshot of another PR or an old head; missing push activity also lets previous-head reports satisfy current-head reviewer readiness.”

4. Extend tracking issue #31 with the fresh-snapshot case from M2. Require regression cases for Mira and a required generic reviewer where `commit(B) < report(A) < push(B)` and B’s push activity is unavailable: A’s report must not satisfy B’s reviewer readiness. In `openspec/roadmap.md`, replace `#31 readiness bound to the snapshot's PR and head` with `#31 readiness bound to the snapshot's PR and head, including current-head reviewer evidence when push activity is missing`.

CHANGES_APPLIED: yes

## Rebuttals

None submitted for round 5. Round 4’s required changes and the subsequent #38 and #50 edits are present and are not reopened. Existing defects accurately recorded with tracking issues are accepted as scheduled gaps.

Author, after round 5:
- **Required change 1:** applied. The feedback-record and watch-token State ownership rows carry the given gap sentences, and Known gaps has the new row for hyphenated cache filenames (#32, #39).
- **Required change 2:** applied. #32 and #39 have comments describing the collisions and the regression cases (`acme-tools/widget` and `acme/tools-widget` with the same change name or PR number). The roadmap reads `#32 pass ownership and collision-free feedback-record keys` and `#39 watch token race and collision-free watch keys`.
- **Required change 3:** applied. A new "Reviewer report cutoff" row in Resource bounds and failure visibility states the commit-time fallback, the earlier-head report marking the current head `reported` in a fresh snapshot, and that nobody detects it until the evidence is inspected (#31). The #31 Known gaps entry has the given text.
- **Required change 4:** applied. #31 has a comment with the fresh-snapshot case and the regression cases (`commit(B) < report(A) < push(B)`, B's push activity unavailable, Mira and a required generic reviewer). The roadmap's #31 entry has the given text.

No ADR text changed, so ADRs 0001-0006 stay `Status: accepted`.

Reviewer re-check: All four required changes are accepted. Issue extensions were checked against the supplied comments because the configured GitHub credential was unavailable.

- **Required change 1:** accepted; both State ownership additions and the #32/#39 Known gaps row are present.
- **Required change 2:** accepted; the #32/#39 comments cover both collision cases and the required independent-record/watcher regressions; both roadmap entries are updated.
- **Required change 3:** accepted; the report-cutoff row describes the commit-time fallback, stale evidence in a fresh snapshot and failure visibility; the #31 Known gaps entry is updated.
- **Required change 4:** accepted; the #31 comment specifies Mira and a required generic reviewer, `commit(B) < report(A) < push(B)`, unavailable push activity and rejection of A's report for B; the roadmap entry is updated.

Author, after the round-5 re-check: rounds 3, 4 and 5 ran beyond `specwright-roadmap`'s two-round cap at the user's explicit direction on PR #41 (2026-10-09: "more rounds, see where this leads us to", then "keep going until codex is finally happy"); the missing reset rule is #49. After the re-check, one sentence of `openspec/architecture.md` (the Design review row) was reworded to record that approval for every round after the second.

Reviewer re-check of the post-review edit: Accepted. Against HEAD `7091b19`, the baseline edit is limited to that sentence; `git diff HEAD --stat` confirms no changes to strategy, roadmap or ADRs. The wording matches the author note’s approval for rounds 3–5 and preserves the skill’s two-round cap and #49 reset-rule gap. The round-5 `VERDICT: APPROVE_WITH_CHANGES` with `CHANGES_APPLIED: yes` still covers the baseline as edited; its basis is unchanged.

Reviewer re-check of the second post-review edit: Accepted. Against HEAD `95c3da8`, `git diff HEAD` and `git diff HEAD --stat` show only the Known gaps paragraph and roadmap scheduling bullet: two files, three insertions. The table and its issue numbers are unchanged; every listed issue carries `known-gap`, and open issues #52 and #53 match the stated later defects. Scheduling at the next milestone close fits the existing re-planning step, with earlier inclusion allowed when a change touches the same code. The frozen table preserves the reviewed snapshot while labelled issues keep later defects visible without editing it. The round-5 `VERDICT: APPROVE_WITH_CHANGES` with `CHANGES_APPLIED: yes` still covers the baseline as edited.