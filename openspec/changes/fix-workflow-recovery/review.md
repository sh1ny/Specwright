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

VERDICT: APPROVE_WITH_CHANGES

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
CHANGES_APPLIED: yes

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
