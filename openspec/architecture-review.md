# Review

## Metadata

- **Round:** 3
- **Prior round:** round 2 APPROVE_WITH_CHANGES at ce98b40, changes applied and re-checked; since then 11 PR fix rounds on PR #41 edited the files.
- **Reviewer:** cross-model CLI (codex)
- **Reviewed:** Current checkout at `8fe137d7c2a2cdccb9f7a578ae04e4ef10e928df`: `openspec/strategy.md`, `openspec/architecture.md`, `openspec/roadmap.md`, prior `openspec/architecture-review.md`; all six ADRs `0001`–`0006`; all six `skills/*/SKILL.md`; all four `skills/specwright-pr/scripts/*.sh`; both PR references and all three roadmap references; `schemas/specwright/schema.yaml` and its five artifact templates; all four agent definitions; both settings/config templates; `README.md`; `CONTRIBUTING.md`; `evals/fakes/gh.py`, `evals/pr-pair/test_skill_text.py`, `test_as_sh.py`, `test_fake_gh.py`, and selected sections of `test_pr_pair.py`, `evals/git-workflow/evals.json`, `fixtures.py`, and `grade.py`; baseline diff from ce98b40; tracking issues including #9 and #43–#45. Verification included in-memory probes and five passing skill-text tests. No files were modified.

## Findings

### Critical (blocking)

None.

### Moderate

**M1 — The stated Python minimum permits a runtime that cannot create feedback-pass records.**

`openspec/strategy.md:13`, `openspec/architecture.md:90` and `docs/adr/0002-agent-instructions-with-thin-scripts.md:11` specify Python 3.8+. The interpreter gate accepts those versions at `skills/specwright-pr/scripts/pr-pair.sh:35–39`, but `pass write` calls `Path.write_text(..., newline="\n")` at `:932`. That parameter was introduced in Python 3.10. [Python documentation](https://docs.python.org/3.10/library/pathlib.html#pathlib.Path.write_text)

On Python 3.8 or 3.9, a valid pass reaches this call and raises `TypeError` before publishing its record. The exception also bypasses the JSON error contract because the dispatcher catches only `Stop` at `:1220–1221`. An in-memory probe using the older method signature reproduced the unexpected-keyword failure without writing files.

[#45](https://github.com/sh1ny/specwright/issues/45) covers missing prerequisite documentation, but assumes 3.8+ works; it does not cover this incompatibility. Advertising and checking that minimum would still leave store-backed feedback unusable on accepted installations.

**M2 — Body clipping does not trigger the documented incomplete-evidence handover.**

The snapshot resource row at `openspec/architecture.md:98` combines body clipping with an at-bound response of `complete: false` and `truncated`. The implementation distinguishes them: thread-comment bodies are clipped at 2500 characters, and comment/review bodies at 1200 (`skills/specwright-pr/scripts/pr-snapshot.sh:158–168`); only connection overflow contributes to `truncated` and `complete` (`:217–237`).

A probe of the actual shaping expression with one long review returned `complete: true`, `truncated: []`, and omitted an actionable finding after character 1200. The returned preview says to see the URL, but `skills/specwright-pr/SKILL.md:84–96` requires handover only for list truncation and does not require fetching clipped bodies before judging or dropping an item.

Consequently, the documented completeness check can pass while feedback used for disposition is incomplete. A summary followed by findings beyond the preview can be dropped as non-actionable. #9 concerns pagination beyond 100 items and does not address this separate boundary.

**M3 — Local finish has an unrecorded interruption boundary between the two merges.**

`skills/specwright-finish/SKILL.md:32–35` merges and deletes the store branch before merging the code branch. Interruption between those operations leaves the archive on the store’s main and the code change unmerged.

The documented re-entry path says to report “Nothing to finish” and stop when the archive has reached main (`:16–19`, applied to each repo for store-backed changes). It provides no continuation for the remaining code merge. Interruption immediately after the archive commit has a related problem: re-entry repeats the unconditional archive-commit command at `:26`, without a path for an already committed archive.

The architecture’s failure table at `openspec/architecture.md:96–106` covers task reconciliation and PR feedback recovery but omits these finish boundaries. The finish evals cover normal completion and merge conflicts (`evals/git-workflow/evals.json:364–491`), rather than resumption after a successful archive commit or store merge. The consequence is a partially finished local change requiring manual continuation despite durable evidence being available.

### Suggestions

None.

## Verdict

VERDICT: APPROVE_WITH_CHANGES

The foundational decisions are sound. Approval requires accurately recording the three remaining limitations; their runtime fixes may remain explicitly tracked. Previously resolved round-2 findings are not reopened.

## Required Changes

1. Correct the Python claims in `openspec/strategy.md:13`, `openspec/architecture.md:90` and ADR 0002: distinguish the script’s current acceptance of Python 3.8+ from feedback-pass creation’s effective requirement of Python 3.10+. Add a Known gaps entry linked to a tracking issue for the `Path.write_text(newline=...)` incompatibility and uncontrolled error output. Add that compatibility fix and minimum-version verification to the roadmap’s existing Python prerequisite work alongside #45.
2. Replace the snapshot resource row’s combined bound response with separate behavior: list overflow sets `complete: false`; thread bodies clip at 2500 characters and comment/review bodies at 1200 without changing completeness. Record that clipped previews require full-body retrieval before disposition, and that the current skill does not require it. Add a linked Known gaps entry and roadmap work for full-body retrieval or visible handover before judging clipped feedback.
3. Add a finish failure row describing interruption after the archive commit and between store/code merges, the current lack of a documented resume path, and who discovers the partial state. Add a linked Known gaps entry and a bounded roadmap change for evidence-based finish resumption, with regression cases for both interruption points.

CHANGES_APPLIED: yes

## Rebuttals

Author, after round 3:
- **Required change 1:** applied. The strategy, ADR 0002 and the architecture's script contract now say the scripts accept Python 3.8+ but store-backed feedback (`pass write`) needs 3.10+, and that the failure escapes the JSON contract. Known gaps lists it as #46, scheduled in 0.1.9 together with #45.
- **Required change 2:** applied. The PR snapshot row now covers list overflow only (`complete: false`). A new "PR snapshot bodies" row gives the clipping limits (2500 for thread comments, 1200 for PR comments and reviews), says clipping does not change `complete` and that feedback does not yet fetch full bodies, and links #47. Known gaps lists #47, scheduled in 0.1.11.
- **Required change 3:** applied. A new "Local finish" failure row covers both interruption points (after the archive commit, and between the store and code merges), the missing resume path, and that the user finds the partial state. Known gaps lists #48, scheduled in 0.1.10, whose change is renamed `fix-workflow-recovery`; #48 asks for regression evals for both points.

Reviewer re-check:

`gh issue view` could not read #46–#48 because gh has no authenticated account; this re-check uses the issue references in the files.

- **Required change 1:** accepted. All three Python claims distinguish acceptance from the effective requirement and record the JSON-contract failure. Known gaps tracks #46; 0.1.9 pairs minimum-version compatibility and error handling with #45, under M1's regression-test requirement.
- **Required change 2:** accepted. The separate rows accurately describe list overflow and body clipping, require full text before disposition, and acknowledge the current skill gap. Known gaps tracks #47; 0.1.11 schedules full-body retrieval before judgement.
- **Required change 3:** accepted. The failure row records both interruption points, the missing resume path and user discovery. Known gaps tracks #48; 0.1.10 schedules evidence-based resumption at both points, under M1's regression-test requirement.