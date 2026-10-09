# Review

## Metadata

- **Round:** 2
- **Prior round:** round 1 REVISE (3 Critical, 6 Moderate); author responses in its Rebuttals
- **Reviewer:** cross-model CLI (codex)
- **Reviewed:** `openspec/architecture-review.md`, `openspec/strategy.md`, `openspec/architecture.md`; ADRs `docs/adr/0001-build-on-unmodified-openspec.md` through `docs/adr/0006-openspec-resolves-the-planning-root.md`; all six `skills/*/SKILL.md`; all four `skills/specwright-pr/scripts/*.sh`; both PR references and all roadmap references; `schemas/specwright/schema.yaml` and its five artifact templates; all four agent definitions under `agents/`; both files under `templates/openspec/`; `README.md`; `CONTRIBUTING.md`; `evals/pr-pair/test_skill_text.py`, `evals/pr-pair/test_as_sh.py`, and selected sections of `evals/pr-pair/test_pr_pair.py`, `evals/fakes/gh.py`, `evals/git-workflow/evals.json`, `evals/git-workflow/fixtures.py`, and `evals/git-workflow/grade.py`. Tracking issues #25, #26 and #29–#38 were checked, excluding #28. Verification included read-only, in-memory probes; no files were modified.

## Findings

### Critical (blocking)

No open Critical findings. The following round-1 findings are resolved as baseline findings; their runtime defects remain open and explicitly tracked.

**Round 1 C1 — Resolved: the ambient identity exception is documented.**

`docs/adr/0004-process-scoped-github-identity.md:11-13` and `openspec/architecture.md:76` now distinguish configured, fenced identities from the unfenced default. This matches `templates/openspec/specwright.yaml:13-14` and `skills/specwright-pr/SKILL.md:47-51`. [#38](https://github.com/sh1ny/specwright/issues/38) tracks the remaining default-identity defect. The rebuttal is accepted.

**Round 1 C2 — Resolved: feedback exclusivity is identified as an unenforced assumption.**

`openspec/architecture.md:65` now names the intended session owner and acknowledges that exclusivity is not enforced. [#32](https://github.com/sh1ny/specwright/issues/32) covers acquisition, ownership checks and interruption recovery. The check-then-replace sequence remains at `skills/specwright-pr/scripts/pr-pair.sh:896-933`, but the baseline no longer presents it as exclusive ownership. The rebuttal is accepted.

**Round 1 C3 — Resolved: stale or unrelated readiness evidence is a tracked defect.**

`openspec/architecture.md:85` and `:97` accurately qualify readiness; [#31](https://github.com/sh1ny/specwright/issues/31) specifies identity and current-head validation. The unchanged readiness function still accepts unrelated passing evidence, confirmed by an in-memory probe. Recording that defect is sufficient for this baseline review. The rebuttal is accepted.

### Moderate

**Round 1 M1 — Resolved: safe updates are a target, with the current failure modes recorded.**

`openspec/strategy.md:22`, `docs/adr/0001-build-on-unmodified-openspec.md:19` and `openspec/architecture.md:86` acknowledge interruption, mixed installed generations and shared-schema replacement. [#36](https://github.com/sh1ny/specwright/issues/36) covers their lifecycle and ownership. These qualifications match `README.md:87-98` and `:139-164`. The rebuttal is accepted.

**Round 1 M2 — Resolved: reviewer edits hidden by later replies are documented and tracked.**

`openspec/architecture.md:64` and `:99` state the remaining race accurately. [#33](https://github.com/sh1ny/specwright/issues/33) addresses revision-bound dispositions and revalidation. `pr-reply.sh:84-105` still lacks a revision precondition; `pr-snapshot.sh:102-103` and `:143-148` still compare edits with later reply timestamps. The rebuttal is accepted.

**Round 1 M3 — Resolved: recovery is qualified by repository layout.**

`openspec/architecture.md:84` separates store-backed recovery from repo-local interruption after the final pushed fix. [#34](https://github.com/sh1ny/specwright/issues/34) covers completing replies, resolutions and review requests without consuming another round. This matches `skills/specwright-pr/SKILL.md:65`, `:85-91` and `:108`. The rebuttal is accepted.

**Round 1 M4 — Resolved: partial-pass overcounting is accurately recorded.**

`openspec/architecture.md:84` and `:102` identify the defect; [#29](https://github.com/sh1ny/specwright/issues/29) specifies trailer precedence. `pr-pair.sh:804-807` still counts feedback subjects alongside trailers, while `evals/pr-pair/test_pr_pair.py:951-972` explicitly permits multiple commits under one round. The rebuttal is accepted.

**Round 1 M5 — Resolved: store git transport is distinguished from fenced API reads.**

`openspec/architecture.md:76` and `:101` document the credential mismatch. [#35](https://github.com/sh1ny/specwright/issues/35) covers repository-specific git transport. This matches `pr-pair.sh:85-93`, `:99-144` and `:763-779`; the private-store test at `evals/pr-pair/test_pr_pair.py:1175-1189` covers API identity only. The rebuttal is accepted.

**Round 1 M6 — Resolved: the OpenSpec pin is described as unenforced documentation.**

`docs/adr/0001-build-on-unmodified-openspec.md:11` and `openspec/architecture.md:72` acknowledge the public installation gap, tracked by [#37](https://github.com/sh1ny/specwright/issues/37). This matches the unversioned commands and version-only prerequisite check at `README.md:42` and `:54-64`. The rebuttal is accepted.

**N1 — Still open, new: watcher cleanup can erase a newer owner's claim and silently end monitoring.**

`pr-snapshot.sh:67` checks the ownership token and removes its file in separate operations. A concrete interleaving is: watcher A reads its own token during cleanup; watcher B publishes its token at `:62-63`; A removes B's file. B then fails `still_owner` at `:71` and exits 4 at `:325`.

`skills/specwright-pr/SKILL.md:118` interprets exit 4 as another watcher owning the PR and directs the agent to do nothing. In this sequence no watcher remains, so unattended feedback and CI monitoring stop without the intended handover.

The watch-token state is absent from `openspec/architecture.md:58-68` and ADR 0003's local-state description at `:11`. The failure is also absent from Known gaps. Document the ownership limitation and track an atomic takeover/cleanup protocol.

**N2 — Still open, new: ADR 0006 declares a universal pairing protocol that supported flows do not follow.**

`docs/adr/0006-openspec-resolves-the-planning-root.md:12-14` says store-backed changes have paired, identically named commits in code-first order and a linked pair of PRs in PR mode.

Those rules apply more narrowly:

- Task commits use code-first pairing, but no-code tasks have only a store commit (`skills/specwright-commit/SKILL.md:26`).
- Planning and archive commits can be store-only (`skills/specwright-commit/SKILL.md:22`; `skills/specwright-finish/SKILL.md:26`).
- Feedback commits and pushes use store-first ordering (`skills/specwright-pr/SKILL.md:98`).
- The expected PR set can contain only the store, only the code, or neither (`pr-pair.sh:568-595`; `evals/pr-pair/test_pr_pair.py:346-367`).

This makes valid recovery and publication behavior contradict an accepted ADR that future designs must obey (`schemas/specwright/schema.yaml:210-214`). Qualify commit pairing by phase and define PR publication through the expected-set contract.

**N3 — Still open, new: the resource table omits unbounded metadata reads and does not describe effective timeout coverage.**

`openspec/architecture.md:83-85` covers snapshot page limits and polling intervals, but not the fully paginated paths. `pr-pair.sh:468-480` captures and materializes every page before processing it; linking and recovery read complete comment/activity lists (`:650`, `:982-984`). After-limit issue reuse scans every repository issue separately for each finding (`skills/specwright-pr/SKILL.md:108-110`). For F findings and I issues, that path reads O(F × I) issue records.

Network subprocesses have no Specwright timeout (`pr-pair.sh:85-87`, `:106-107`, `:127-133`). The watch timeout counts sleep intervals rather than elapsed time and cannot interrupt a blocked poll (`pr-snapshot.sh:320-327`). A stalled command prevents timeout reporting and ownership checks; larger histories increase both buffered output and time before control returns.

Record these limits and failure visibility explicitly, with tracking for command deadlines/cancellation and bounded metadata processing. Paging alone does not bound total memory or work.

### Suggestions

**Round 1 S1 — Resolved: stdout contracts are described per script and mode.**

`openspec/architecture.md:75` and `docs/adr/0002-agent-instructions-with-thin-scripts.md:11` now distinguish JSON snapshots/pair decisions, appended logs and plain reply-action output. This matches `pr-reply.sh:63-105` and `pr-snapshot.sh:337-342`. The rebuttal is accepted.

**Round 1 S2 — Resolved: review quality has a comparison population and an unresolved-findings measure.**

`openspec/strategy.md:21` identifies the maintainer's merged PR population, the pre-ship-review comparison point and findings still open or deferred at handoff. It explicitly excludes fewer fix rounds as sufficient evidence. This is a measurement definition, not evidence that the target has already been achieved. The rebuttal is accepted.

## Verdict

VERDICT: APPROVE_WITH_CHANGES

The round-1 rebuttals are accepted. The remaining changes concern baseline accuracy and two untracked failure/bounds gaps; approval does not require fixing the already acknowledged runtime defects.

## Required Changes

1. In ADR 0006, replace the universal commit-pair and PR-pair bullets with phase-specific rules: task code commits precede matching store ticks; no-code tasks are store-only with `Code-Changes: none`; planning/archive commits may be store-only; feedback commits share a round trailer and use store-first publication. State that PRs follow `pr-pair.sh expected`, including store-only, code-only and empty sets, and are linked when both exist.
2. Add the watch ownership token to the architecture's State ownership table and ADR 0003's local working-state description. Add the N1 cleanup interleaving and silent exit-4 consequence to the watch failure row and Known gaps. Link a new tracking issue titled `pr-snapshot: release_watch can delete a newer watcher's ownership token`, covering atomic takeover/cleanup and a regression test for that interleaving.
3. Add resource/failure rows for fully paginated metadata reads and network-command execution. State the current full-output buffering, repeated issue scans, absence of Specwright command deadlines, and the watch timeout's inability to interrupt a blocked poll. Link a new tracking issue titled `PR scripts: bound metadata processing and enforce command deadlines`, covering bounded processing, cancellation, safe partial-read behavior and visible timeout reporting.

CHANGES_APPLIED: yes

## Rebuttals

Author, after round 2:
- **Required change 1:** applied. ADR 0006 now gives commit pairing by phase and defines PRs by the `pr-pair.sh expected` set.
- **Required change 2:** applied. The watch ownership token is in the State ownership table and in ADR 0003; the N1 race is in the watch-polling row and in Known gaps; tracked as #39.
- **Required change 3:** applied. There are new rows for fully paginated metadata reads and for network commands; tracked as #40.

Reviewer re-check: `gh issue view` for #39 and #40 failed because GitHub CLI has no authentication; the issue references in the files were used as requested.

- **Required change 1:** accepted. ADR 0006 correctly distinguishes task, no-code, planning/archive and feedback commits, and defines publication through the expected PR set. The rules match the current workflow and script.
- **Required change 2:** accepted. Both documents include watch ownership state; the architecture records deletion of a newer token, silent exit 4 and loss of monitoring, with #39 tracking the gap.
- **Required change 3:** accepted. The new resource/failure rows record full-output buffering, repeated issue scans, missing command deadlines and blocked-poll timeout limitations, matching the current code and tracked by #40.