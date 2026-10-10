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

Round 2 verdict (void, superseded by round 3): APPROVE_WITH_CHANGES

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
Round 2 changes applied: yes

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

---

# Round 3

## Metadata

- **Round:** 3
- **Prior round:** Round 2: APPROVE_WITH_CHANGES, changes applied and re-checked (`CHANGES_APPLIED: yes`). That verdict was voided by amendments made after a local pre-ship review (OMP) of the implemented branch found five defects (D9 hidden text and closing list, D8 pr-mode code merge, D2 file-name length and legacy-move race), plus D10's `--login` flag.
- **Reviewer:** fresh-context subagent (Claude Code, Claude Agent SDK reviewer)
- **Reviewed:**
  - The amendment diff (`git diff -- openspec/changes/fix-workflow-recovery`) and the full current design.md (Triage, D2, D8, D9, D10, diagrams, all FULL tables), specs/pr-descriptions/spec.md, the requirement and scenario list of specs/change-finish/spec.md and specs/feedback-passes/spec.md, and tasks.md (test map, groups 10-11).
  - skills/specwright-pr/scripts/pr-pair.sh: `CLOSE_KW`, `ISSUE_REF`, `strip_code_spans`, `without_code`, `issue_key`, `intended_issues`, `cmd_closing_check`, `graphql_read`, `cmd_closed_check`, `record_dir`, `record_path`, `legacy_record_path`, `publish`, `locate_record`, `record_lock`, the temp-file helper, `load_record`; the header (Python 3.8+).
  - skills/specwright-finish/SKILL.md (**Resume**, `## local`, `## pr`) and skills/specwright-pr/SKILL.md (**Cleanup after merge**, the `closed-check` line).
  - evals/pr-pair/test_pr_pair.py (the `PublishFallback` in-process harness, the `closed-check` tests including `--login`).
  - openspec/architecture.md (pass-record row). The output of `openspec validate fix-workflow-recovery --strict` (valid).
- **Findings verified against the code:** all five hold. `without_code` skips only fences and code spans; `intended_issues` adds every reference on a keyword-led line (pr-pair.sh:729-730); the Resume row "store done; code branch with commits, code not M" has no mode (specwright-finish/SKILL.md:33); `record_path` keeps the full sanitised owner, name and change (pr-pair.sh:1065); `old.unlink()` at pr-pair.sh:1131 is unguarded.

<!-- This verdict covers only the contents reviewed. Editing proposal, specs or design afterward (other than applying Required Changes) voids it. -->

## Findings

### Critical (blocking)

None.

### Moderate

**M1. D9's indented-code rule still counts code GitHub hides, in the direction that closes issues.**
- The rule skips 4+-indented lines "that follow a blank line or another such line, outside a list". In CommonMark an indented code block cannot interrupt a paragraph, but it can follow any other block with no blank line between them: an ATX or setext heading, a closing fence, a thematic break, an HTML comment block. It can also be the first line of the description. CommonMark's spec examples show `# Heading` followed directly by `    foo` rendering as a heading and a code block.
- Example: `## Verification` followed directly by `    pytest -k "fixes #52"`. GitHub renders the second line as code. Under D9 as written it is not skipped, so `fixes #52` is intended. At ship, 52 is `missing`. The line holds other text, so it is not rewritten, and ship stops on the second check. At cleanup, `closed-check` lists 52 as `open` and cleanup closes it. That is the P1 class this amendment is meant to remove.
- "Outside a list" is not implementable as stated: the design does not say how a line is known to be inside a list (item content offset, lazy continuation, blank lines between items). Inside a list, a line indented four columns past the item's content is also code (`- item`, a blank line, then `      Fixes #52`), and the rule counts it.
- D9 itself says skipping is the safe side, because a wrongly skipped reference is only `extra`. The rule should lean that way:
  - skip a line indented four or more columns (a tab counts to the next multiple of four) unless the line before it is a paragraph line, that is non-blank text that is not a heading, fence, thematic break or HTML-comment line;
  - the first line counts as following a blank line;
  - drop the list exception. An indented list-continuation paragraph is then skipped. GitHub still links it, so ship reports it as `extra`, and nothing is closed wrongly.

**M2. D9's closing list does not say where it starts, so `Fixes the crash; Related: #52` can still name 52.**
- The amended text defines the list as "the references read in order, each separated from the one before by only" separators. It does not say that the first reference must come directly after the line's leading keyword.
- The current code takes every reference on a keyword-led line. The minimal change that satisfies the new scenario (`Fixes #21; Related: #52`) stops the list at text after a reference. That change still starts the list at the first reference anywhere on the line.
- Lines such as `Fixes the flaky upload; Related: #52` or `Resolves the crash (see #52)` would then make 52 intended, and cleanup would close it. GitHub links neither, because a keyword names only the reference directly after it.
- The new scenario and `test_closed_check_ignores_related_on_a_closing_line` do not catch this, because their line starts with a reference.

### Suggestions

**S1. D8: say what the new pr-mode row does when the code branch has no PR.**
- "Its PR not merged" includes having no PR at all: the store merged by hand before the code branch was ever shipped. "Report the PR (ship or watch)" leaves the agent to guess.
- State the cases:
  - no PR, or the branch ahead of its PR → `## pr` ship for the code repo;
  - an open PR → report it and offer **watch**;
  - a PR closed without merging → report it and ask.
- The finish flowchart in **Diagrams** shows neither the `local`-only code merge nor this row.

**S2. D2: the legacy probe is not bounded.**
- The 120-character cut bounds the new key, but `legacy_record_path` still builds `owner-name-change.json` in full.
- On Python 3.8-3.11 (supported, per the pr-pair.sh header) on Linux or macOS, `Path.exists()` raises `ENAMETOOLONG` for a name over 255 characters instead of returning False. `locate_record` then ends in `internal_error`.
- It takes a 39-character owner, a 100-character name and a change name over about 109 characters, so it is rare.
- 0.1.9 could never have created such a file, so treating a legacy name over 255 characters as absent is enough. The new scenario's 80-character change name does not reach this case.

**S3. Record the new bounds and race in the tables.**
- Resource Bounds: add a row for the record file name. It is at most 120 + 1 + 32 + `.json`, so 158 characters, and 163 with `.lock`. The temp files are short `mkstemp` names.
- Flow & State Gaps: add a line for two callers moving one legacy record. The caller that loses `publish` gets `FileExistsError` and continues with the new key. An old file already gone at `unlink` counts as moved.
- Triage and the Mechanism Ledger need no change: there is no new component or mechanism.

The other amendments hold:
- D8's `local` restriction and the new scenario "Store merged by hand, code PR still open" fix finding 3. The scenario is assertable by a text test (`test_resume_pr_mode_keeps_an_open_code_pr`), as group 6's red evidence was.
- D2's prefix cut keeps keys unique: the hash covers the full case-folded identity, and the readable part is only for humans. "Already gone at `unlink` counts as moved" fixes finding 5. The new scenario can be driven in process through the existing `PublishFallback.namespace()` harness.
- D9's HTML-comment and multi-line code-span rules err toward skipping, which is the safe side for both ship and cleanup.
- D10's `--login o/n=L` matches `cmd_closed_check` (pr-pair.sh:812-816) and the **Cleanup after merge** call. It is already tested (test_pr_pair.py:2138-2142).
- Tasks 11.1-11.4 cover the five findings, and their test-map rows are red. They need the cases from M1 and M2 added (Required Change 3).

## Verdict

Round 3 verdict (void, superseded by round 4): APPROVE_WITH_CHANGES

## Required Changes

1. **design.md D9, indented code (M1).**
   - Replace "lines indented four or more spaces, or a tab, that follow a blank line or another such line, outside a list".
   - The new rule skips every line indented four or more columns, a tab advancing to the next multiple of four, unless the line before it is a paragraph line. A paragraph line is non-blank text other than a heading, a fence line, a thematic break or an HTML-comment line.
   - The first line of the description counts as following a blank line.
   - Drop the list exception, and say that an indented list paragraph skipped this way is only reported as `extra`.
2. **design.md D9, closing list (M2).**
   - State that the closing list starts at the reference directly after the line's leading keyword, with only whitespace and the optional `:` between them.
   - A keyword-led line whose first reference does not directly follow the keyword has no closing list. It names only what the "directly after a closing keyword" rule names.
3. **specs/pr-descriptions/spec.md and tasks.md 11.1.**
   - Extend the scenario "Closing keyword hidden from the rendered description", or add one, with an indented line directly after a heading.
   - Add a scenario. WHEN a merged PR's description has the line `Fixes the crash; Related: #52`, and issue 52 is open, THEN 52 is not an intended issue, and cleanup does not close it.
   - Add both cases to the tests named in 11.1 (`test_closed_check_ignores_hidden_references`, `test_closed_check_ignores_related_on_a_closing_line`) and to the test map.

<!-- yes (applied, and re-checked by the reviewer - only the reviewer sets it) | no (outstanding) | n/a (any other verdict) -->
Round 3 changes applied: yes

## Rebuttals

<!-- Author: fixed (cite) or rebutted (reason) per finding. A Critical/Moderate rebuttal counts only once marked "accepted by reviewer". -->

- **M1:** fixed. D9 skips every line indented four or more columns unless the line before it is a paragraph line; the first line counts as following a blank line; no list exception (an indented list paragraph is only `extra`). The scenario "Closing keyword hidden from the rendered description" names an indented line directly after a heading, and task 11.1's test covers it.
  - **Reviewer:** verified, and accepted by reviewer. D9 skips a line indented four or more columns (tabs to the next multiple of four) unless the line before it is a paragraph line, counts the first line as following a blank line, and drops the list exception. The heading case is in the scenario "Closing keyword hidden from the rendered description" and in task 11.1. Editorial nit, non-blocking: D9's skip sentence nests the indented-code rule between semicolons ("indented code: ... Lists get no exception: ...; HTML comments"). Splitting it into a sub-list would read more clearly.
- **M2:** fixed. D9: the closing list starts at the reference directly after the leading keyword; a keyword-led line whose first reference does not follow it has no closing list. New scenario "Closing line without a closing list", test `test_closed_check_ignores_a_line_without_a_closing_list` (task 11.1, test map).
  - **Reviewer:** verified, and accepted by reviewer. The closing list starts only at a reference directly after the leading keyword, and a line like `Fixes the crash; Related: #52` has none. The scenario "Closing line without a closing list", task 11.1 and the test-map row (red) match.
- **S1:** applied. D8 has two pr-mode rows (no PR or open PR → ship for the code branch; closed unmerged → report and ask); the finish flowchart shows the local-only code merge and both pr-mode paths. The change-finish scenario says the open code PR is shipped and reported.
  - **Reviewer:** verified. D8 has two pr-mode rows: no PR or an open PR → ship, merging and deleting nothing; a PR closed unmerged → report and ask. The flowchart shows both, and the local-only code merge. The change-finish scenario and task 11.2 match.
- **S2:** applied. D2 and Flow & State Gaps: an old path the OS rejects as too long counts as absent; task 11.3 covers it.
  - **Reviewer:** verified. D2 and Flow & State Gaps treat an old path the OS rejects as too long as absent, and task 11.3 implements it. Non-blocking: no test is named for it. A case in `test_record_key_is_bounded_for_the_longest_names` with a change name over 110 characters would cover it.
- **S3:** applied. Resource Bounds row for the record file name (158, 163 with `.lock`); Flow & State Gaps line for two callers moving one old record.
  - **Reviewer:** verified. The Resource Bounds row (158 characters, 163 with `.lock`) and both Flow & State Gaps lines are present.
- **Gate lines:** round 2's `VERDICT` and `CHANGES_APPLIED` lines are relabelled, so only round 3's lines match.
  - **Reviewer:** verified. Only round 3's `VERDICT:` and `CHANGES_APPLIED:` lines start a line. `openspec validate fix-workflow-recovery --strict` reports the change valid.

---

# Round 4

## Metadata

- **Round:** 4
- **Prior round:** Round 3: APPROVE_WITH_CHANGES, changes applied and re-checked (`CHANGES_APPLIED: yes`). That verdict was voided by amendments made after a second local pre-ship review of the implemented branch found nine P2 defects (D9: fence closer, a removed span joining words, a `<!--` inside a span; D8: store-only archive recovery, the planning-only test on resume, a finished planning-only change; D2: OS errors in `load_record`; task 12.5: the store-resume graders; task 12.6: the fake `gh` node-reaction read), plus D10's confirmation before closing, added at the user's request.
- **Reviewer:** fresh-context subagent (Claude Code, Claude Agent SDK reviewer); Required Changes and the applied suggestions re-checked by the same reviewer in a separate run
- **Reviewed:**
  - The amendment diff (`git diff -- openspec/changes/fix-workflow-recovery`) and the full current design.md (Triage, D8, D9, D10, Diagrams, every FULL table, Risks); specs/change-finish/spec.md (all); specs/pr-descriptions/spec.md ("Issues a merged PR left open are closed at cleanup" and the scenarios before it); the new scenario in specs/feedback-passes/spec.md; specs/planning-stores/spec.md ("Local finish merges the repos that have work"); tasks.md (test map, group 12).
  - skills/specwright-finish/SKILL.md (all: **Resume**, steps 1-4, `## local`, `## pr`, **Planning repo**, **Archive name**).
  - skills/specwright-pr/SKILL.md (ship step 4.3, watch step 2, **Cleanup after merge**).
  - skills/specwright-pr/scripts/pr-pair.sh: `CLOSE_KW`, `ISSUE_REF`, `strip_code_spans`, `without_code`, `LIST_GAP`, `intended_issues`, `locate_record`, `load_record`, `find_marker`.
  - evals/git-workflow/grade.py (`merge_head`, `is_merge_of`, the `eval-store-finish-resume-code-merge` branch), evals/git-workflow/fixtures.py (that fixture), evals/fakes/gh.py (`whoami`, `cmd_graphql`, `cmd_api`), and the list of tests in evals/pr-pair/test_skill_text.py that name `closed-check`.
  - The output of `openspec validate fix-workflow-recovery --strict` (valid).
  - The re-check read the current diff (`git diff -- openspec/changes/fix-workflow-recovery`): design.md (D2, D8 table and bullets, D9, D10, flowchart, Failure & Visibility, Flow & State Gaps, Mechanism Ledger, Risks), specs/change-finish/spec.md and specs/pr-descriptions/spec.md (both new requirements and the amended ones), the tasks.md test map and group 12, and the output of `openspec validate fix-workflow-recovery --strict` (valid).
- **Findings verified against the code:** all nine hold.
  - 1-3: `intended_issues`, run in process from the current pr-pair.sh, returns 52 for `` Fi`x`xes #52 `` and for a fenced block holding ```` ``` not a fence ```` followed by `Fixes #52`, and returns nothing for `` Shows `<!--` in the docs `` followed by `Fixes #21`.
  - 4: specwright-finish/SKILL.md:47 makes the store-only recovery branch and leaves the code repo "as it is", while the rows at :33 and :37 act on the code branch whenever the store is done.
  - 5: SKILL.md:29 sends "archive paths uncommitted, no A" to step 3 and :40 says a resume writes no marker.
  - 6: the planning-only local finish (`## local` store-backed step 3) leaves the code repo with no A, M or B, which no row matches.
  - 7: `load_record` catches only `FileNotFoundError` and `ValueError` (pr-pair.sh:1247-1253).
  - 8: the resume code-merge grader checks only the merge commit's parents and subject (grade.py:886-893, `is_merge_of`).
  - 9: the `node(id` branch of `cmd_graphql` (gh.py:282-295) calls neither `whoami` nor the `readers` check that the issue and pull-request branches apply.

<!-- This verdict covers only the contents reviewed. Editing proposal, specs or design afterward (other than applying Required Changes) voids it. -->

## Findings

### Critical (blocking)

None.

### Moderate

**M1. D8's new "uncommitted archive paths, no A" row skips step 1, so a resume on main can commit the archive on main.**
- The row now says "step 2 (the planning-only test, store-backed), then step 3". Step 1 is the step that handles main: when archive changes are uncommitted on main, it offers `chore/archive-<change-name>` and says "Never commit on main" (specwright-finish/SKILL.md:44-47). It also confirms a branch whose change name differs.
- Step 3 has a branch guard only for store-backed changes (`test "$(git branch --show-current)" = <branch>`). A repo-local change has none (SKILL.md:54).
- Example: a repo-local change in `finish: pr`. The PR merged before archive, the user ran the archive on main, and the first finish died before step 1 made the recovery branch. On the rerun, Resume applies (the change directory is gone), no A exists, so the row runs step 3, and the archive commit lands on main.
- The skill's own entry rule already says a repo with no A runs steps 1-3 (SKILL.md:18). The row should say the same: steps 1, 2 and 3 in order. The flowchart's "archive paths uncommitted? yes → step 3" edge has the same gap.

**M2. D8's `Archive-Scope: store-only` line has no stated writer, no stated read, and no stated precedence over the code rows.**
- **Writer.** D8 says only that the recovery's archive commit "carries" the line. Step 3 writes the subject alone to `<msgfile>`. Task 12.4 says "(step 1 and step 3)", but the design never says which step writes it or what decides it. Step 3 can decide it from git: store-backed, and the store's current branch is `chore/archive-<change-name>`, the only branch step 1 makes in the store. That condition also holds on a resume of an interrupted recovery, where step 1's own decision is gone. Without the condition stated, a resume that reaches step 3 on the recovery branch (M1) can write the commit without the line, and then the code rows act on the code repo again, which is finding 4.
- **Read.** A is found with `git log --format=%s`, which shows subjects only. The marker needs the body, for example `git log -1 --format=%B <A>` with an exact-line match `^Archive-Scope: store-only$`. When a change name is reused, there can be more than one A on main, so the design must say which one: the newest, on the branch, or else on `<main>`.
- **Precedence.** The table is read as "the first step not done". The new row sits after "store done; code branch with commits, code not M, local → code merge" and the pr-mode ship row, and its condition is a subset of theirs. An agent that matches rows top-down merges or ships the code branch first. D8's bullet says the code repo is out of scope, but the table has to agree: put the row first among the "store done" rows, or say it is checked before them.
- **Report.** It is unstated whether an out-of-scope code repo counts as done for `Nothing to finish`. As written, a store-only recovery never reaches that line, and every later finish reports the code branch again. The scenario says only "reports it". State the final report.

**M3. D8's planning-only marker read has no path a resume can compute.**
- "Its archive on `<main>` holds `specwright-change.yaml`" needs `<archived-name>`. The skill's **Archive name** rule takes `archivedAs` from the archive output, which a resume does not have, or else `YYYY-MM-DD-<change-name>`. On a resume, the only date at hand is today's.
- A resume on a later day than the archive builds the wrong path, finds no marker, and asks the user. The scenario "Planning-only change already finished" says it reports `Nothing to finish`, so it fails.
- A glob over `<P>/changes/archive/*-<change-name>/` on `<main>` avoids the date problem, but with a reused change name it can find an earlier archive's marker and wrongly call the code repo done. pr-pair.sh's `find_marker` handles that case explicitly (the regex `(\d{4}-\d{2}-\d{2}-)?<change>` plus the main-ref filter).
- The store's A is always found in this case, because the marker was committed in it (step 2 adds it to the archive paths that step 3 commits). Read the path from A: `git show --name-only --format= <A>` gives `<P>/changes/archive/<dir>/specwright-change.yaml` if the marker exists. Then match `git show <main>:<that path>` against `^code_changes:\s*none\s*$`, the same test `find_marker` uses. No such file in A means the change is not planning-only.

**M4. The requirement texts do not carry the new behaviour, only the scenarios do.**
- pr-descriptions, "Issues a merged PR left open are closed at cleanup": the SHALL still says cleanup closes each open, never-closed intended issue. It does not mention the confirmation. An implementation that closes without asking meets the requirement and fails only the scenarios. At archive, the main spec's requirement says the opposite of its scenarios "Merged PR left an issue open" and "User declines a close".
- change-finish, "Finish resumes from git evidence": the SHALL is scoped to "a change whose archive is already committed". The new scenario "Interrupted before the archive commit, planning-only change" is outside that scope. The store-only and planning-only-done rules have no SHALL at all.

**M5. The implemented closing list accepts `,`, `;`, `and` or a keyword before its first reference, contrary to D9, and the new span rule makes that matter more.**
- D9 (round 3, Required Change 2) says the closing list starts at the reference directly after the leading keyword, "only whitespace and the optional `:` between them". `intended_issues` measures that first gap with `LIST_GAP` (pr-pair.sh:796-801), which also accepts `,`, `;`, `and` and another keyword.
- Run in process today, `Fixes, #52`, `` Fixes `x`; #52 `` and `` Fixes `#21` and #52 `` all return 52. GitHub links none of them: the keyword's own reference is missing or in code.
- The consequence: on a `created` PR, 52 is `missing`. The line holds other text, so it is not rewritten, and ship stops on the second check with a false mismatch. At cleanup, 52 is offered for closing. With the new D9 rule, any removed span between the keyword and a later reference produces this shape.
- No test covers it: the round-3 tests' lines start with a reference or with prose. Add it to task 12.1.

**M6. The FULL sections do not reflect the round-4 amendments.**
- **Diagrams:** the finish flowchart still shows "archive paths uncommitted → step 3" and has no path for a store-only recovery, a finished planning-only change, or a code repo without A, M or B that is reported and asked about.
- **Flow & State Gaps:** add a line for each of these:
  - the store-only recovery (the code repo is left to its own PR);
  - the finished planning-only change, and the same state without a marker (ask);
  - a declined issue. It stays `open`, so every later cleanup asks about it again. Cleanup is not one-shot: Resume routes a merged PR to cleanup, and `cleanup-plan` keeps reporting it.
- **Mechanism Ledger:** two new mechanisms have no row:
  - the `Archive-Scope: store-only` commit line, a new contract in commit messages that later finish versions read;
  - the user confirmation before closing. Its reason is that the parser only approximates GitHub's renderer: this review alone found three P2 parser defects. Give the evidence that would remove it.
- **Failure & Visibility:** the "Issue close at cleanup" row should cover a declined issue: it is reported as left open, and a rerun asks again.
- **Risks:** the parser-disagreement entry should name the cleanup confirmation as its mitigation.

### Suggestions

**S1. D10: define the confirmation's scope.**
- "Asks the user once" is inside "for each merged PR". A store-backed change can have two merged PRs. Say whether that is one question for the change or one per PR. One question for the change matches "once".
- Ask only when some PR has a non-empty `open` list. The scenario "Every intended issue closed" should not trigger a question, and neither should `not_merged`, `not_default_base` or exit 3.
- Watch's `cleanup` action (specwright-pr/SKILL.md:119-120) now reaches a question. That fits watch, which already asks elsewhere. No live eval runs this cleanup (only text tests name `closed-check`), so nothing automated is blocked.

**S2. Test map and scenarios after the confirmation.**
- The row "Merged PR left an issue open" is still green, but its THEN changed to "asks the user to confirm". Add `test_cleanup_asks_before_closing` to that row and mark it red until 12.3.
- The scenario "Closing an issue fails" says "a later cleanup closes only 24". Make it "a later cleanup asks about and closes only 24".

**S3. Task 12.5: make the grader check exact.**
- "Contains the fixture's code branch tree" is not one assertion. The fixture's code main has only the initial commit, so a correct `--no-ff` merge has exactly the branch tip's tree. Record `git rev-parse feat/add-greeting^{tree}` in fixture-state.json and assert that `git rev-parse main^{tree}` equals it. An `-s ours` merge leaves main's old tree and fails.
- Say where the `-s ours` negative check lives: a test case, or a one-off check recorded in the task's commit. As written, nobody can tell later whether it was run.

**S4. D9: two precision notes, non-blocking.**
- "Code spans are found before HTML comments" differs from CommonMark's rule only where a comment opens before a backtick run. There, CommonMark takes the comment, and the D9 order can only hide more text, because removing a span that swallows `-->` extends the comment. Removing a span never exposes text GitHub hides, so the rule is on the safe side. Say "within a paragraph": a line that starts with `<!--` is an HTML block, which CommonMark recognises before any inline parsing.
- The fence rule is correct for the closer (same character, at least as long, up to three spaces of indent, only white space after). A backtick opener whose info string holds a backtick is not a fence in CommonMark. Treating it as one only skips more, which is the safe side.

**S5. Task 12.6: name the fixture change.** Seeding nodes with their repository changes `add_node_reaction`'s signature. The task should say that the existing callers in test_pr_pair.py are updated without weakening their assertions, as group 2 says for record fixtures.

The other amendments hold:
- D9's fence-closer and span-space rules match CommonMark and the three new scenarios. The fence-closer and span-space rules err toward skipping. The comment-opener rule fixes a reference that was wrongly skipped, and it follows CommonMark's leftmost-first rule for the case it names.
- D2's "cannot be read (any OS error)" fits `locate_record`. Its `except Stop` branch already reports the old file as ignored beside a valid record. So making `load_record` raise `record_unreadable` for any `OSError` other than `FileNotFoundError` gives the scenario "Old key denied by the filesystem" in both halves, as task 12.2 says.
- D10's confirmation conflicts with no scenario once S2 is applied. "Issue reopened", "Issue in another repository", "PR not merged", the non-default base and "Issue state cannot be read" ask nothing.
- Task 12.6 matches finding 9. The `readers` rule it adds is the one the issue and pull-request GraphQL branches already use.
- The eight new test-map rows match the eight new scenarios, are red, and name files that exist (`evals/pr-pair/test_skill_text.py`, `evals/pr-pair/test_pr_pair.py`, `evals/git-workflow/test_instructions.py`).

## Verdict

VERDICT: APPROVE_WITH_CHANGES

## Required Changes

1. **design.md D8 table and flowchart (M1).** Change the row to "uncommitted archive paths, no A → steps 1-3 in order (step 1's branch and main checks, then step 2, store-backed, then step 3)". Make the flowchart's "archive paths uncommitted: yes" edge go to steps 1-3. Align change-finish's scenario "Interrupted before the archive commit, planning-only change" if it names only step 2.
2. **design.md D8, store-only recovery (M2).**
   - Step 3 writes `Archive-Scope: store-only` as its own body line in `<msgfile>` exactly when the change is store-backed and the store's current branch is `chore/archive-<change-name>`.
   - Resume reads it from the store's newest A (on `<branch>`, else on `<main>`) with `git log -1 --format=%B <A>`, matching the exact line.
   - The store-only row is checked before every "store done" code row: move it to the top of them, or state the order.
   - State the report: either the out-of-scope code repo counts as done for `Nothing to finish`, or the final line names the code branch as left to its own PR.
   - Make task 12.4 say the same.
3. **design.md D8, planning-only finished (M3).** The marker path comes from the store's A (`git show --name-only --format= <A>`, the `specwright-change.yaml` under `<P>/changes/archive/`). The marker counts when `git show <main>:<path>` matches `^code_changes:\s*none\s*$`. A without that file → not planning-only, report and ask. Make task 12.4 say the same.
4. **Spec requirement texts (M4).**
   - pr-descriptions, "Issues a merged PR left open are closed at cleanup": cleanup SHALL list the issues it would close and ask the user to confirm, close only the confirmed ones, and report declined ones as left open.
   - change-finish, "Finish resumes from git evidence": extend the scope to a change whose archive paths are uncommitted, with the planning-only test before the archive commit. Add SHALLs that a code repo is left untouched when the store's archive commit is marked store-only, and that a code repo with no archive commit, merge or branch is done when the store's archive commit holds the planning-only marker.
5. **tasks.md 12.1 and the test map (M5).** Add a parser test (for example `test_closed_check_list_starts_directly_after_the_keyword`) with `Fixes, #52`, `` Fixes `x`; #52 `` and `` Fixes `#21` and #52 ``, each naming no intended issue. Give it a red test-map row under "Closing line without a closing list", or a new scenario. Fix `intended_issues` so that only whitespace and an optional `:` may separate the leading keyword from the first reference.
6. **design.md FULL sections (M6).** Update the flowchart, Flow & State Gaps, Mechanism Ledger, the "Issue close at cleanup" Failure & Visibility row and the parser Risk as listed in M6.

<!-- yes (applied, and re-checked by the reviewer - only the reviewer sets it) | no (outstanding) | n/a (any other verdict) -->
CHANGES_APPLIED: yes

## Rebuttals

<!-- Author: fixed (cite) or rebutted (reason) per finding. A Critical/Moderate rebuttal counts only once marked "accepted by reviewer". -->

- **M1:** fixed. D8's no-A row runs steps 1-3 in order (branch check and recovery branch first); the flowchart edge says the same. Task 12.4.
  - **Reviewer:** verified, and accepted by reviewer. The row reads "steps 1-3 in order (branch check and recovery branch, planning-only test, archive commit)", and the flowchart edge "steps 1-3: branch check, planning-only test, archive commit" matches. The change-finish scenario names the planning-only test, not a step number alone, so it needs no change.
- **M2:** fixed. D8: step 3 writes `Archive-Scope: store-only` when store-backed and the store is on `chore/archive-<change-name>`; Resume reads it with `git log -1 --format=%B <A>` on the newest store A; rows are checked top to bottom, first match wins, and the out-of-scope row sits right after "M, not B", ahead of the code-merge and ship rows; an out-of-scope code repo counts as done for `Nothing to finish`.
  - **Reviewer:** verified, and accepted by reviewer. The design now states the writer and its git-decidable condition (it holds on a resume too), the body read with an exact-line match on the newest store A, first-match ordering with the row ahead of every "store done" code row and the pr-mode rows, and the report: done for `Nothing to finish`. The Flow & State Gaps line and task 12.4 say the same.
  - Non-blocking: "M and B" still sits above the store-only row. A code repo that is store-only out of scope but still has a fully merged branch with its own `merge: <change-name>` would get `git branch -d`. The deletion is safe, because M requires the tip on main, but it contradicts the new SHALL NOT "delete the code repo's branch". Moving the store-only row above "M and B", or limiting the SHALL to unmerged branches, would remove the conflict. Fix it during 12.4.
- **M3:** fixed. D8 takes the marker path from `git show --name-only --format= <A>` and checks `git show <main>:<path>` against `^code_changes:\s*none\s*$`; without it, report and ask (its own row).
  - **Reviewer:** verified, and accepted by reviewer. The marker is located through the store's A, so it is independent of the archive date and of an earlier archive with the same name. It is tested with `find_marker`'s regex. The "no such marker → report and ask" case has its own row and a flowchart edge.
- **M4:** fixed. The cleanup requirement now lists, asks once, closes confirmed issues and keeps declined ones open; the change-finish rules for a re-run before the archive commit, the store-only recovery and the finished planning-only case are a new requirement, "Finish resume keeps the planning-only test and each repo's scope", holding those three scenarios; the confirmation is its own requirement, "Cleanup asks before closing issues", holding "User declines a close" (openspec warned that the extended requirement texts were over 500 characters). The test map names the new requirements.
  - **Reviewer:** verified, and accepted by reviewer.
    - "Issues a merged PR left open are closed at cleanup" now closes only issues "that the user confirmed".
    - The new requirement "Cleanup asks before closing issues" carries the list-ask-once rule and the rule that declined issues stay open.
    - "Finish resumes from git evidence" is rescoped to "runs again for a change it already archived".
    - The new requirement "Finish resume keeps the planning-only test and each repo's scope" carries all three rules.
    - Splitting them into two requirements meets the intent of Required Change 4.
    - The three change-finish scenarios and "User declines a close" sit under the new requirements, and the test-map rows name them.
    - `openspec validate fix-workflow-recovery --strict` reports the change valid.
- **M5:** fixed. D9 says a `,`, `;`, `and`, another keyword or a removed code span between the leading keyword and the first reference means no closing list. Task 12.1 adds `test_closed_check_list_needs_a_ref_right_after_the_keyword` with a red test-map row (scenario "Closing line without a closing list").
  - **Reviewer:** verified, and accepted by reviewer. D9 names the forbidden separators explicitly. Task 12.1 lists the three probe lines and extends the `intended_issues` fix to the first gap, and the red row sits under the right scenario.
- **M6:** fixed. Flowchart: steps 1-3 edge, store-only and planning-only edges. Flow & State Gaps: store-only recovery, finished planning-only with and without its marker, a declined issue asked about again. Mechanism Ledger rows for the confirmation and the `Archive-Scope` line. Failure & Visibility close row and the parser risk mention the confirmation.
  - **Reviewer:** verified, and accepted by reviewer. Every listed update is present, including the steps 1-3 edge, the OUT edge and both planning-only edges, the three Flow & State Gaps lines and the two Ledger rows. The confirmation row names its exit evidence, and the close row says a rerun asks about the rest. The parser Risk names the confirmation.
- **S1:** applied. One question per change, only when some merged PR has `open` issues (D10, task 12.3).
  - **Reviewer:** verified. D10 and task 12.3 ask one question for the change, and nothing when no merged PR has `open` issues.
- **S2:** applied. The "Merged PR left an issue open" row adds `test_cleanup_asks_before_closing` and is red; "Closing an issue fails" says a later cleanup asks about and closes only 24.
  - **Reviewer:** verified. Both edits are present.
- **S3:** applied. Task 12.5 asserts `main^{tree}` equals the recorded tip tree and names where the `-s ours` check lives.
  - **Reviewer:** verified. The `main^{tree}` equality is one assertion. The `-s ours` negative check is a unit test in `test_instructions.py` or a new `test_grade.py`, so later readers can find it.
- **S4:** applied. D9: "within a paragraph", and a line starting with `<!--` is an HTML block.
  - **Reviewer:** verified.
- **S5:** applied. Task 12.6 says `add_node_reaction`'s callers are updated without weakening their assertions.
  - **Reviewer:** verified.
- **Gate lines:** round 3's `VERDICT` and `CHANGES_APPLIED` lines are relabelled, so only round 4's lines start a line with those keys.
  - **Reviewer:** verified.
