# Review

## Metadata

- **Round:** 2
- **Prior round:** Round 1: APPROVE_WITH_CHANGES, changes applied and re-checked by the reviewer. That verdict was voided by amendments made after implementation: #61 part 3 (D10) and the local pre-ship review fixes in D2, D8 and D9.
- **Reviewer:** fresh-context subagent (Claude Code, Claude Agent SDK reviewer); Required Changes and the applied suggestions re-checked by the same reviewer in a separate run
- **Reviewed:**
  - The amendment diff (`git diff HEAD -- openspec/`) and the full current proposal.md, design.md, specs/change-finish/spec.md, specs/feedback-passes/spec.md, specs/pr-descriptions/spec.md and specs/planning-stores/spec.md (for context). tasks.md was read for the test map and groups 9-10 only.
  - openspec/roadmap.md (M1, change 2 entry) and openspec/architecture.md (closing and known-gap rows). The in-force ADRs docs/adr/0002, 0003, 0004 and 0006.
  - skills/specwright-pr/scripts/pr-pair.sh: header, `without_code`, `issue_key`, `intended_issues`, `cmd_closing_check`, `link_state`, `record_path`, `legacy_record_path`, `publish`, `locate_record`, `record_lock`, `load_record`, `pass_write`, `pass_done`, `pass_adopt` and `cmd_cleanup`.
  - skills/specwright-pr/SKILL.md (watch step 2, **Cleanup after merge**) and skills/specwright-finish/SKILL.md (**Resume**, **After the PR is merged**).
  - GitHub issue sh1ny/specwright#61.
  - The output of `openspec validate fix-workflow-recovery --strict` (valid).
  - The re-check read the current diff (`git diff HEAD -- openspec/changes/fix-workflow-recovery/`): design.md (Triage, D2, D8, D9, D10, Failure & Visibility, Resource Bounds, Flow & State Gaps, Mechanism Ledger), all of specs/pr-descriptions/spec.md, the new scenarios in specs/feedback-passes/spec.md, the tasks.md test map and groups 9-10, and the output of `openspec validate fix-workflow-recovery --strict` (valid).
  - None of the amendments is implemented yet: `closed-check` does not exist, and `without_code` and `intended_issues` still match single-backtick spans and no ordered-list marker (tasks 9.x and 10.x are open). So this round reviews the amended design against the current code it will change.

<!-- This verdict covers only the contents reviewed. Editing proposal, specs or design afterward (other than applying Required Changes) voids it. -->

## Findings

### Critical (blocking)

None.

### Moderate

**M1. D10 closes intended issues after a merge into a branch other than the default, which contradicts D9's `not_default_base` handling.**
- D9 and the requirement "Closing references need the default branch" deliberately treat a PR into a non-default base as one that does not close its issues: ship reports that GitHub will not close them from this PR.
- D10's `closed-check` reads only `state`, `url` and `body`. Its status is `merged` or `not_merged`, so it closes every open intended issue of any merged PR.
- Specwright supports a `main_branch` that differs from the repository's default branch (round 1, M3). In such a repo, for example a gitflow repo with `develop` as main and `master` as the default branch, every merged change has its issues closed at cleanup. They close before the fix reaches the default branch, with the comment "Its closing keyword did not close this issue on merge". That comment is wrong: the keyword was never meant to apply there. The cleanup also reverses what ship just told the user.
- The design must decide this case, and the spec needs a scenario for it.

**M2. D10 re-closes an issue that a person reopened after GitHub had already closed it from this PR.**
- The backstop's test is "intended and currently open". Cleanup is not one-shot:
  - **Cleanup after merge** runs whenever the user says the PRs merged;
  - `specwright-finish` **Resume** routes "pr, the branch's PR merged" to cleanup on any later finish attempt;
  - `cleanup-plan` keeps reporting a merged PR after its branch is gone (`pr-pair.sh` `cmd_cleanup`).
- A maintainer who reopens issue 21 because the fix did not work has it closed again by the next cleanup run, with a comment that claims the PR fixed it. That silently reverses a human decision on GitHub, which ADR 0003 treats as the state of record.
- The case is detectable in the same read. The issue's timeline shows a `ClosedEvent` whose `closer` is this PR. GitHub's own close happened, so the issue was later reopened on purpose.

**M3. D10's tables and requirement leave out its failure behavior, and the Mechanism Ledger states the opposite decision.**
- The Mechanism Ledger still has "Cleanup backstop that closes issues | No | Deferred by the user (#61 part 3)", while D10 builds it.
- Failure & Visibility has no row for `closed-check` or for the `gh issue close` step. D10 says only "Any failed read exits 3". It does not say what happens when one `gh issue close` fails after others succeeded:
  - is the backstop reported done or not done;
  - is a rerun safe (it is, since closed issues are skipped, but the design must say so);
  - who finds out.
- The new requirement has no scenario for a failed close, so an implementation that reports "backstop done" after a failed close would pass every test in the map.
- Triage T1 and T4 still list only `pass adopt` and `closing-check` and the `closingIssuesReferences` read. D10 adds a subcommand, per-issue reads, and the change's first issue write on GitHub (close plus comment).

**M4. Two new D9 scenarios are under the wrong requirement.**
`Closing keyword inside code` and `Numbered closing line` were appended under "Closing references need the default branch" (specs/pr-descriptions/spec.md). They test the parser of "Closing references are checked after ship", and the tasks.md test map already lists them under that requirement. At archive they would sync into the main spec under a requirement about the base branch, and the map's requirement → scenario rows would no longer match the spec.

### Suggestions

**S1. D2: stop on an unreadable legacy file only when the new key is absent.**
- As amended, "the lookup stops with `record_unreadable`" applies to every `pass` call, including `pass done` and `pass plan` of a valid, owned new-key record. The legacy path is the 0.1.9 colliding key: `acme-tools/widget` and `acme/tools-widget` share `acme-tools-widget-<change>.json`. A corrupt file of another identity would then block this repo's in-progress pass.
- When the new key exists, report the unreadable legacy file the way `legacy_record_ignored` is reported, and continue. The record's identity question only matters when the lookup would otherwise start a new pass.

**S2. D10: do not read the state of issues outside the change's repositories, or read them so that one failure does not abort the check.**
"Each intended issue's state read through its repository's login" has no login for an arbitrary `other/tool#5`. With "any failed read exits 3", a closing line naming an issue the configured login cannot read (a private repo, a typo in the owner) makes the whole check unknown. Then the open issues inside the change are not closed either. Since out-of-change issues are only reported, list them as "not checked" without reading them, or record a per-issue `unknown`.

**S3. D10: compare repositories case-insensitively.**
`issue_key` keeps the slug's case as written in the description. Deciding "in the PR's repository or the change's other repository" must lower-case both sides, as D2 and D9 already do. Otherwise `Fixes Acme/App#5` is reported instead of closed.

**S4. D8 still carries the round-1 S7 wording slip.**
D8 says the `*/<change-name>` match includes `chore/archive-<change-name>`. It does not. skills/specwright-finish/SKILL.md (Resume) and tasks 6.2 already use the correct order: the prefix branch, then a local `chore/archive-<change-name>`, then the one `*/<change-name>` branch. The new "Archive-recovery branch after the change merged" scenario depends on that lookup, so align the design text with it.

**S5. D9: state the CommonMark rule for code spans precisely.**
"Delimited by a backtick run of any length" should say that a span closes only at a backtick run of the same length, and that an unmatched run is literal text. A naive any-length regex that pairs the first run with any later run would strip a real `Fixes #21` that sits between an unmatched backtick and a later span. Add one parser case for an unmatched backtick in 10.4.

## Verdict

VERDICT: APPROVE_WITH_CHANGES

## Required Changes

1. **design.md D10 and specs/pr-descriptions "Issues a merged PR left open are closed at cleanup" (M1).**
   - `closed-check` also reads the PR's `baseRefName` and the repository's `defaultBranchRef` in its one PR read.
   - When they differ, it prints `status: not_default_base` with the open intended issues, and cleanup closes nothing and reports them. Or, if the author decides the backstop should close them, D10 must say so and give the comment a wording that does not claim a keyword failed. Either way, state the decision.
   - Add a scenario. WHEN a PR merged into a branch other than the repository's default branch names issue 21 on a closing line, and 21 is open, THEN cleanup does what the design decided, and the report says why.
2. **design.md D10 and the same requirement (M2).**
   - For each open intended issue, `closed-check` reads whether its timeline holds a `ClosedEvent` whose `closer` is this PR. Such an issue is listed as `reopened` and is never closed; cleanup reports it.
   - Add a scenario. WHEN issue 24 was closed by the merged PR and later reopened, THEN cleanup does not close it and reports it as reopened.
3. **design.md tables and the same requirement (M3).**
   - Mechanism Ledger: change the backstop row to "Yes", with D10's reason (#61: issues left open silently after merge) and the evidence that would change the call.
   - Failure & Visibility: add rows for `closed-check` (a failed read → exit 3, the backstop is reported not done, branch cleanup continues; retry safe) and for `gh issue close` (a failed close → the backstop is reported not done, naming the issues still open; a rerun skips closed issues, so it is safe; the user finds out from the cleanup report).
   - Triage T1/T4 evidence: add `closed-check`, its per-issue reads and the issue-close write.
   - Spec: add a scenario. WHEN closing an open intended issue fails, THEN cleanup reports the backstop as not done and names that issue, and branch cleanup continues.
4. **specs/pr-descriptions/spec.md (M4).** Move `Closing keyword inside code` and `Numbered closing line` from "Closing references need the default branch" to the end of "Closing references are checked after ship", matching the tasks.md test map.

<!-- yes (applied, and re-checked by the reviewer - only the reviewer sets it) | no (outstanding) | n/a (any other verdict) -->
CHANGES_APPLIED: yes

## Rebuttals

<!-- Author: fixed (cite) or rebutted (reason) per finding. A Critical/Moderate rebuttal counts only once marked "accepted by reviewer". -->

Author, round 2 (as reported by the coordinator): M1-M4 and S1-S5 applied.

- **M1:** fixed.
  - **Reviewer:** verified, and accepted by reviewer.
    - `closed-check` reads `baseRefName` and `defaultBranchRef` in its one PR read and prints `status: not_default_base`. Cleanup then closes nothing and reports that the issues stay open until the fix reaches the default branch.
    - The requirement now says "merged into its repository's default branch", and the scenario "PR into a branch other than the default, at cleanup" is assertable.
- **M2:** fixed.
  - **Reviewer:** verified, and accepted by reviewer.
    - An open issue with any earlier `ClosedEvent` is listed as `reopened`, reported, and never closed. The scenario "Issue reopened after it was closed" covers it.
    - The test is broader than the one Required Change 2 named (any close event, not only one whose closer is this PR), so it never closes an issue a person reopened.
    - Its cost is that an issue closed and reopened for some other reason before this PR is reported instead of closed. That errs toward asking, which is acceptable.
- **M3:** fixed.
  - **Reviewer:** verified, and accepted by reviewer.
    - Triage T1 and T4 name `closed-check`, its reads and the issue-close write.
    - Failure & Visibility has rows for `closed-check`, a close that fails partway (a rerun is safe because a failed close leaves no close event), and reopened issues.
    - Resource Bounds has a row for the issue reads, and the Mechanism Ledger rows say "Yes".
    - The scenario "Closing an issue fails" is assertable.
- **M4:** fixed.
  - **Reviewer:** verified, and accepted by reviewer. Both scenarios now sit under "Closing references are checked after ship" (spec.md:51-57), matching the test map.
- **S1:** applied.
  - **Reviewer:** verified. D2 and Flow & State Gaps stop on an unreadable legacy file only when the new key is absent. The new scenario "Unreadable old key beside a valid record" covers the other case.
  - Editorial nit, non-blocking: D2's bullet reads "Otherwise, with the new path absent, When its `code_repo`". Lower-case "When".
- **S2:** applied.
  - **Reviewer:** verified. Issues outside `--repos` are listed as `outside` and never read. The scenario "Issue in another repository" says so, and task 9.1 tests that an outside read failure does not cause exit 3.
- **S3:** applied.
  - **Reviewer:** verified. D10 compares repositories case-insensitively.
- **S4:** applied.
  - **Reviewer:** verified. D8's lookup order (prefix branch, then `chore/archive-<change-name>`, then `*/<change-name>`) matches the finish skill.
- **S5:** applied.
  - **Reviewer:** verified. D9 states the CommonMark rule: a span closes only at a run of the same length, and an unmatched run is literal. The scenario "Unmatched backtick" and its test row cover it.
