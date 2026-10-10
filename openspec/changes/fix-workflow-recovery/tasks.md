# Tasks

## Test map

Script behaviour is tested at the real boundary: `pr-pair.sh` run through `bash` against real git repos and the fake `gh` (`evals/fakes/gh.py`), in `evals/pr-pair/test_pr_pair.py`. `evals/pr-pair/test_skill_text.py` and `evals/git-workflow/test_instructions.py` check where a rule sits in the skill text, by position and key terms. Agent evals (`evals/git-workflow/evals.json`, graded by `grade.py`) cover finish paths that change branch state.

| Requirement | Scenario | Test file | Test name | State |
|---|---|---|---|---|
| feedback-passes → A feedback pass has one owner | Two sessions start a pass for one change | evals/pr-pair/test_pr_pair.py | test_pass_write_is_exclusive_under_concurrency | green |
| feedback-passes → A feedback pass has one owner | Resume by the owning session | evals/pr-pair/test_pr_pair.py | test_pass_owner_plans_and_completes | green |
| feedback-passes → A feedback pass has one owner | Record left by another session | evals/pr-pair/test_pr_pair.py; evals/pr-pair/test_skill_text.py | test_pass_plan_reports_foreign_owner; test_feedback_asks_before_adopting_a_foreign_record | green |
| feedback-passes → A feedback pass has one owner | User confirms owner is gone | evals/pr-pair/test_pr_pair.py | test_pass_adopt_hands_over_the_record | green |
| feedback-passes → A feedback pass has one owner | Handover races another session | evals/pr-pair/test_pr_pair.py | test_pass_adopt_refuses_a_stale_from | green |
| feedback-passes → A feedback pass has one owner | Lock left by an interrupted handover | evals/pr-pair/test_pr_pair.py | test_pass_adopt_and_done_refuse_a_held_lock | green |
| feedback-passes → A feedback pass has one owner | Removal by a non-owner | evals/pr-pair/test_pr_pair.py | test_pass_done_refuses_a_non_owner | green |
| feedback-passes → Pass records are keyed per repository and change | Hyphenated owners and names | evals/pr-pair/test_pr_pair.py | test_record_keys_do_not_alias_hyphenated_identities | green |
| feedback-passes → Pass records are keyed per repository and change | Record from 0.1.9 | evals/pr-pair/test_pr_pair.py | test_legacy_record_is_moved_to_the_new_key | green |
| feedback-passes → Pass records are keyed per repository and change | Old key belongs to another repository | evals/pr-pair/test_pr_pair.py | test_legacy_record_of_another_identity_is_left_alone | green |
| feedback-passes → A pass intent is validated before it is written | Well-formed intent | evals/pr-pair/test_pr_pair.py | test_pass_write_accepts_a_well_formed_intent | green |
| feedback-passes → A pass intent is validated before it is written | `prs` is a string | evals/pr-pair/test_pr_pair.py | test_pass_write_refuses_malformed_prs | green |
| feedback-passes → A pass intent is validated before it is written | Round is not a positive integer | evals/pr-pair/test_pr_pair.py | test_pass_write_refuses_a_bad_round | green |
| feedback-passes → A pass intent is validated before it is written | Thread finding without a usable root id | evals/pr-pair/test_pr_pair.py | test_pass_write_refuses_a_bad_root_id | green |
| feedback-passes → A pass intent is validated before it is written | Repo-local intent names a store PR | evals/pr-pair/test_pr_pair.py | test_repo_local_pass_write_refuses_a_store_pr | green |
| feedback-passes → Repo-local changes recover an interrupted pass | Interrupted after the last allowed fix was pushed | evals/pr-pair/test_pr_pair.py; evals/pr-pair/test_skill_text.py | test_repo_local_final_pass_resumes_without_a_new_round; test_feedback_uses_pass_record_for_repo_local | green |
| feedback-passes → Repo-local changes recover an interrupted pass | Repo-local pass completes | evals/pr-pair/test_pr_pair.py | test_repo_local_pass_completes_and_is_removed | green |
| feedback-passes → Repo-local changes recover an interrupted pass | Repo-local record names a store edit | evals/pr-pair/test_pr_pair.py | test_repo_local_pass_write_refuses_store_destination | green |
| change-finish → Finish resumes from git evidence | Interrupted after the archive commit, local mode | evals/git-workflow/evals.json | eval-finish-resume-after-archive-commit; eval-finish-resume-from-main | green |
| change-finish → Finish resumes from git evidence | Interrupted after the merge, before the branch deletion | evals/git-workflow/test_instructions.py | test_finish_resume_deletes_a_merged_branch_without_merging | green |
| change-finish → Finish resumes from git evidence | Interrupted after the archive commit, pr mode | evals/git-workflow/test_instructions.py | test_finish_resume_pr_mode_ships_without_a_second_archive_commit | green |
| change-finish → Finish resumes from git evidence | Archive committed on the branch but archive paths dirty | evals/git-workflow/test_instructions.py | test_finish_resume_stops_on_dirty_archive_paths | green |
| change-finish → Finish resumes from git evidence | Every repo already done | evals/git-workflow/test_instructions.py | test_finish_resume_reports_nothing_to_finish_only_when_all_done | green |
| change-finish → Finish resumes from git evidence | Archive commit not found | evals/git-workflow/test_instructions.py | test_finish_resume_reports_no_archive_found | green |
| pr-descriptions → One closing keyword per issue | PR fixing three issues | evals/pr-pair/test_skill_text.py | test_description_requires_one_closing_keyword_per_issue | green |
| pr-descriptions → One closing keyword per issue | Partly resolved issue | evals/pr-pair/test_skill_text.py | test_description_keeps_related_for_partial_fixes | green |
| pr-descriptions → One closing keyword per issue | Planning-only store-backed change | evals/pr-pair/test_skill_text.py | test_description_uses_cross_repo_form_without_a_pr_in_the_issue_repo | green |
| pr-descriptions → Closing references are checked after ship | Description matches | evals/pr-pair/test_pr_pair.py | test_closing_check_match | green |
| pr-descriptions → Closing references are checked after ship | Several issues after one keyword on a new PR | evals/pr-pair/test_pr_pair.py; evals/pr-pair/test_skill_text.py | test_closing_check_reports_refs_after_one_keyword_as_missing; test_ship_runs_closing_check_after_ensure_pr | green |
| pr-descriptions → Closing references are checked after ship | Mismatch on an existing PR | evals/pr-pair/test_skill_text.py | test_ship_never_rewrites_a_found_pr_description_on_mismatch | green |
| pr-descriptions → Closing references are checked after ship | Still missing after the rewrite | evals/pr-pair/test_skill_text.py | test_ship_stops_after_a_second_mismatch | green |
| pr-descriptions → Closing references are checked after ship | Issue linked by hand only | evals/pr-pair/test_pr_pair.py | test_closing_check_extra_is_not_a_mismatch | green |
| pr-descriptions → Closing references are checked after ship | Closing list cannot be read | evals/pr-pair/test_pr_pair.py | test_closing_check_lookup_failure_is_unknown | green |
| pr-descriptions → Closing references need the default branch | PR into a branch other than the default | evals/pr-pair/test_pr_pair.py | test_closing_check_not_default_base | green |
| pr-descriptions → Closing references need the default branch | Default branch cannot be read | evals/pr-pair/test_pr_pair.py | test_closing_check_lookup_failure_is_unknown | green |
| feedback-passes → A feedback pass has one owner | Record write fails while it is created | evals/pr-pair/test_pr_pair.py | test_failed_fallback_publish_leaves_no_record | green |
| feedback-passes → Pass records are keyed per repository and change | Old key cannot be read | evals/pr-pair/test_pr_pair.py | test_unreadable_legacy_record_stops | green |
| feedback-passes → Pass records are keyed per repository and change | Unreadable old key beside a valid record | evals/pr-pair/test_pr_pair.py | test_unreadable_legacy_beside_valid_record_is_ignored | green |
| feedback-passes → Pass records are keyed per repository and change | Copy left by an interrupted move | evals/pr-pair/test_pr_pair.py | test_identical_legacy_copy_is_removed | green |
| change-finish → Finish resumes from git evidence | Resumed on the branch it deletes | evals/git-workflow/test_instructions.py | test_resume_checks_out_main_before_deleting | green |
| change-finish → Finish resumes from git evidence | Archive-recovery branch after the change merged | evals/git-workflow/test_instructions.py | test_resume_merge_requires_branch_tip_on_main | green |
| pr-descriptions → Closing references are checked after ship | Closing keyword inside code | evals/pr-pair/test_pr_pair.py | test_closing_check_ignores_multi_backtick_code_spans | green |
| pr-descriptions → Closing references are checked after ship | Numbered closing line | evals/pr-pair/test_pr_pair.py | test_closing_check_reads_numbered_closing_lines | green |
| pr-descriptions → Closing references are checked after ship | Unmatched backtick | evals/pr-pair/test_pr_pair.py | test_closing_check_unmatched_backtick_is_literal | green |
| pr-descriptions → Issues a merged PR left open are closed at cleanup | Merged PR left an issue open | evals/pr-pair/test_pr_pair.py; evals/pr-pair/test_skill_text.py | test_closed_check_lists_open_intended_issues; test_cleanup_closes_open_intended_issues | green |
| pr-descriptions → Issues a merged PR left open are closed at cleanup | Every intended issue closed | evals/pr-pair/test_pr_pair.py | test_closed_check_all_closed | green |
| pr-descriptions → Issues a merged PR left open are closed at cleanup | Related issue still open | evals/pr-pair/test_pr_pair.py | test_closed_check_ignores_related | green |
| pr-descriptions → Issues a merged PR left open are closed at cleanup | Issue in another repository | evals/pr-pair/test_pr_pair.py; evals/pr-pair/test_skill_text.py | test_closed_check_does_not_read_outside_issues; test_cleanup_reports_issues_outside_the_change | green |
| pr-descriptions → Issues a merged PR left open are closed at cleanup | PR not merged | evals/pr-pair/test_pr_pair.py | test_closed_check_not_merged | green |
| pr-descriptions → Issues a merged PR left open are closed at cleanup | PR into a branch other than the default, at cleanup | evals/pr-pair/test_pr_pair.py; evals/pr-pair/test_skill_text.py | test_closed_check_not_default_base; test_cleanup_closes_nothing_off_the_default_branch | green |
| pr-descriptions → Issues a merged PR left open are closed at cleanup | Issue reopened after it was closed | evals/pr-pair/test_pr_pair.py; evals/pr-pair/test_skill_text.py | test_closed_check_reports_reopened; test_cleanup_never_recloses_reopened | green |
| pr-descriptions → Issues a merged PR left open are closed at cleanup | Closing an issue fails | evals/pr-pair/test_skill_text.py | test_cleanup_reports_a_failed_close_and_continues | green |
| pr-descriptions → Issues a merged PR left open are closed at cleanup | Issue state cannot be read | evals/pr-pair/test_pr_pair.py; evals/pr-pair/test_skill_text.py | test_closed_check_lookup_failure_is_unknown; test_cleanup_reports_backstop_not_done | green |
| planning-stores → Local finish merges the repos that have work | Both merges succeed | evals/git-workflow/evals.json | eval-store-finish-local | green |
| planning-stores → Local finish merges the repos that have work | Planning-only change in local mode | evals/git-workflow/evals.json | eval-store-finish-planning-only | green |
| planning-stores → Local finish merges the repos that have work | Store merge conflicts | evals/git-workflow/evals.json | eval-store-finish-store-conflict | green |
| planning-stores → Local finish merges the repos that have work | Code merge conflicts after the store merged | evals/git-workflow/evals.json | eval-store-finish-code-conflict | green |
| planning-stores → Local finish merges the repos that have work | Interrupted between the store merge and the code merge | evals/git-workflow/evals.json | eval-store-finish-resume-code-merge; eval-store-finish-resume-code-merge-from-main | green |
| planning-stores → Feedback rounds span the PR pair | Spec fix requested on the code PR | evals/pr-pair/test_pr_pair.py | test_pass_plan_routes_spec_fix_to_store | green |
| planning-stores → Feedback rounds span the PR pair | Round limit across both repos | evals/pr-pair/test_pr_pair.py | test_rounds_highest_across_branches | green |
| planning-stores → Feedback rounds span the PR pair | Finishing an interrupted final pass | evals/pr-pair/test_pr_pair.py | test_pass_plan_final_pass_push_pending | green |
| planning-stores → Feedback rounds span the PR pair | Recovered partial fix | evals/pr-pair/test_pr_pair.py | test_rounds_ignores_subject_count_when_trailers_exist | green |
| planning-stores → Feedback rounds span the PR pair | Legacy branch without trailers | evals/pr-pair/test_pr_pair.py | test_rounds_legacy_subject_count_without_trailers | green |
| planning-stores → An interrupted feedback pass is completed first | Interrupted between the two fix commits | evals/pr-pair/test_pr_pair.py | test_pass_plan_missing_store_commit | green |
| planning-stores → An interrupted feedback pass is completed first | Interrupted after both pushes | evals/pr-pair/test_pr_pair.py | test_pass_plan_rerequest_and_replies_pending | green |
| planning-stores → An interrupted feedback pass is completed first | Commit made but not recorded | evals/pr-pair/test_pr_pair.py | test_pass_plan_commit_found_by_trailer | green |
| planning-stores → An interrupted feedback pass is completed first | Reply posted, then its resolution failed | evals/pr-pair/test_pr_pair.py | test_pass_plan_reply_done_resolution_pending | green |
| planning-stores → An interrupted feedback pass is completed first | Reviewer follow-up during the interruption | evals/pr-pair/test_pr_pair.py | test_pass_plan_stale_disposition_stops | green |
| planning-stores → An interrupted feedback pass is completed first | Interrupted halfway through a spec fix | evals/pr-pair/test_pr_pair.py | test_pass_plan_partial_edit_not_committable | green |
| planning-stores → An interrupted feedback pass is completed first | Review requests disabled | evals/pr-pair/test_pr_pair.py | test_pass_plan_rerequest_not_applicable | green |
| planning-stores → An interrupted feedback pass is completed first | Pass with an open question thread | evals/pr-pair/test_pr_pair.py | test_pass_plan_question_thread_done_when_replied | green |
| planning-stores → An interrupted feedback pass is completed first | Reply posted, reaction not sent | evals/pr-pair/test_pr_pair.py | test_pass_plan_reaction_todo_until_github_shows_it | green |
| planning-stores → An interrupted feedback pass is completed first | Reaction already present | evals/pr-pair/test_pr_pair.py | test_pass_plan_reaction_done_when_present | green |
| planning-stores → An interrupted feedback pass is completed first | Code PR adopted before the pair was linked | evals/pr-pair/test_pr_pair.py | test_pass_plan_adopted_code_pr_needs_the_link | green |
| feedback-passes → Pass records are keyed per repository and change | Longest repository and change names | evals/pr-pair/test_pr_pair.py | test_record_key_is_bounded_for_the_longest_names | red |
| feedback-passes → Pass records are keyed per repository and change | Two callers move one old record | evals/pr-pair/test_pr_pair.py | test_legacy_move_finished_by_another_caller | red |
| change-finish → Finish resumes from git evidence | Store merged by hand, code PR still open | evals/git-workflow/test_instructions.py | test_resume_pr_mode_keeps_an_open_code_pr | green |
| pr-descriptions → Issues a merged PR left open are closed at cleanup | Related reference on a closing line | evals/pr-pair/test_pr_pair.py | test_closed_check_ignores_related_on_a_closing_line | red |
| pr-descriptions → Issues a merged PR left open are closed at cleanup | Closing line without a closing list | evals/pr-pair/test_pr_pair.py | test_closed_check_ignores_a_line_without_a_closing_list | red |
| pr-descriptions → Issues a merged PR left open are closed at cleanup | Closing keyword hidden from the rendered description | evals/pr-pair/test_pr_pair.py | test_closed_check_ignores_hidden_references | red |

Green rows are unchanged scenarios carried in a MODIFIED requirement. Group 2 re-runs them after the record format changes (the owner, and the reaction read), and updates their fixtures where the new contract requires it, without weakening an assertion. Text checks prove a rule is in the instructions, not that a live agent follows it. The finish evals cover the live paths that change branch state. They are regression guards, not red-first tests: every one, including the `-from-main` variants added during apply (HEAD on main, where the old step 1 said `Nothing to finish`), also passed against the 0.1.9 skill with Opus and Haiku, because the agents reasoned out the resume from the git state. The red evidence for group 6 is its five text tests.

## 1. Test fakes for the new GitHub reads

- [x] 1.1 Extend `evals/fakes/gh.py`:
  - `GET repos/<o>/<n>/pulls/comments/<id>/reactions` (paginated);
  - `gh api graphql` for the queries this change sends: a node's `reactions(content:)` with `user.login`, paged; a PR's `body`, `baseRefName`, `closingIssuesReferences(first: 100)` with `pageInfo`, and the repository's `defaultBranchRef`;
  - state helpers to add reactions, closing references and a default branch;
  - the existing failure injection for each.

  Add cases to `evals/pr-pair/test_fake_gh.py` (red first: unsupported endpoint), then verify `python -m unittest evals.pr-pair.test_fake_gh` (or `discover evals/pr-pair -p "test_fake_gh.py"`) passes.

## 2. Intent validation and round counting (#26, #29; D3, D5)

- [x] 2.1 Add the red tests:
  - `test_pass_write_accepts_a_well_formed_intent`, `test_pass_write_refuses_malformed_prs`, `test_pass_write_refuses_a_bad_round` and `test_pass_write_refuses_a_bad_root_id`;
  - `test_rounds_ignores_subject_count_when_trailers_exist`: a round-1 partial recovery leaves two `Feedback-Round: 1` commits, and `rounds` must report 1 with `limit_reached` false at `max_fix_rounds: 2`.

  Verify each fails for the stated reason: the record is written, or `rounds` is 2.
- [x] 2.2 Implement D3's checks in `pass_write` (including `root_id` for thread findings and `item` for comment and review findings) and D5's rule in `cmd_rounds`. Verify the five tests pass, plus `test_rounds_legacy_subject_count_without_trailers` and `test_pass_write_refuses_findings_pass_plan_cannot_read`. Flip the rows green.
- [x] 2.3 Update `openspec/architecture.md`:
  - the Feedback rounds row in Resource bounds: drop the #29 gap clause;
  - Git evidence formats: the legacy subject counts only on a branch with no trailers in either repo;
  - remove the #29 row from Known gaps if it is listed.

  Verify by reading the rows; `git diff -- docs/adr` stays empty.

## 3. Record key and ownership (#32; D1, D2)

- [x] 3.1 Add the red tests:
  - `test_record_keys_do_not_alias_hyphenated_identities`, `test_legacy_record_is_moved_to_the_new_key`, `test_legacy_record_of_another_identity_is_left_alone`;
  - `test_pass_write_is_exclusive_under_concurrency`: two `pass write` processes started together; exactly one exits 0, the other `record_exists`, and the record holds the winner's owner id;
  - `test_pass_owner_plans_and_completes`, `test_pass_plan_reports_foreign_owner`, `test_pass_adopt_hands_over_the_record`, `test_pass_adopt_refuses_a_stale_from`, `test_pass_adopt_and_done_refuse_a_held_lock`, `test_pass_done_refuses_a_non_owner`.

  Verify they fail (no `owner`, no `adopt`, aliasing key).
- [x] 3.2 Implement D1 and D2 in `pr-pair.sh`:
  - the hashed key and the guarded legacy move;
  - exclusive create (`os.link`, with the `O_EXCL` fallback) and `version: 2` with `owner`;
  - `--owner` on `plan` (`owner`, `owned`) and `done`;
  - `pass adopt --owner --from` under the `<record>.lock` directory (`record_busy`, `not_owner`);
  - the header usage lines.

  Update the existing pass tests' helpers to pass the owner id from `pass write`, changing no assertion. Verify the ten tests and the full `python -m unittest discover evals/pr-pair` pass. Flip the rows green.
- [x] 3.3 Update `skills/specwright-pr/SKILL.md` feedback steps 2, 6 and 10:
  - keep the owner id `pass write` returns;
  - pass `--owner` to `plan` and `done`;
  - on `owned` false or null, post, commit and push nothing for that pass: show the owner (`at`, `checkout`, `host`) and ask whether that session is gone; on yes, `pass adopt --from <shown id|none>` and continue;
  - on `not_owner` or `record_busy`, stop and report; a lock is never removed without the user.

  Add `test_feedback_asks_before_adopting_a_foreign_record` to `test_skill_text.py` (red first), then verify it passes and flip the row green.
- [x] 3.4 Update `openspec/architecture.md`:
  - the Feedback pass record row (owner, exclusive create, collision-free key; drop both #32 gap clauses);
  - Known gaps: remove the #32 rows, and edit the shared #32/#39 row to leave only the watch-key part (#39).

  Verify by reading; `git diff -- docs/adr` stays empty.

## 4. Repo-local passes (#34; D6)

- [x] 4.1 Add the red tests `test_repo_local_final_pass_resumes_without_a_new_round`, `test_repo_local_pass_completes_and_is_removed`, `test_repo_local_pass_write_refuses_store_destination` and `test_repo_local_pass_write_refuses_a_store_pr`, using a single repo fixture with no `--store`. Verify they fail with `usage: missing --store`.
- [x] 4.2 Make `--store` optional for `pass write|plan|done|adopt` and `rounds` per D6: code-only rows, no marker lookup, `misrouted` for a `store`/`both` destination, `invalid_intent` for a non-null `prs.store`. Verify the four tests and the full pr-pair suite pass. Flip the rows green.
- [x] 4.3 Update `skills/specwright-pr/SKILL.md`:
  - "The repos and PRs of a change": the store-only list is `expected`, `pair-state` and `cleanup-plan`;
  - feedback steps 2, 3, 6 and 10 run the `pass` and `rounds` calls for repo-local changes too, without `--store`.

  Update `test_feedback_uses_pass_record_and_rounds` and add `test_feedback_uses_pass_record_for_repo_local` (red first), then verify `test_skill_text.py` passes and flip the row green.
- [x] 4.4 Update `openspec/architecture.md`:
  - the Feedback pass record row (no longer store-backed only);
  - the Feedback rounds row (repo-local resume; drop the #34 clause);
  - the `specwright-pr` component row if it names store-only passes;
  - Known gaps: remove the #34 row.

  Verify by reading.

## 5. Reaction evidence and the link row (#25, #30; D4, D7)

- [x] 5.1 Add the red tests:
  - `test_pass_plan_reaction_todo_until_github_shows_it`: reply posted, no reaction in the fake; the react row is `todo`, `pass done` refuses, and after the fake gains the reaction the plan completes;
  - `test_pass_plan_reaction_done_when_present`;
  - a node-id comment target;
  - a failed reaction read exits 3;
  - `test_pass_plan_adopted_code_pr_needs_the_link`: a store-only pass, a code fix pushed, the code PR opened without links, replies done. It first reproduces #30 (plan reports `complete`); then `link` is `todo`, and `done` after both `link` calls with the row's URLs, leaving exactly one marker per PR.

  Replace `test_pass_plan_reaction_is_rerun_after_reply`, which asserts the old `rerun` behaviour. Verify the new tests fail for the right reason.
- [x] 5.2 Implement D4 (react rows read GitHub with the repo's login; remove `rerun` from the states and from `done_states`) and D7 (factor `cmd_link`'s linked test into one function; read the canonical `html_url` of each PR; add the `link` row with `code.url` and `store.url`). Verify the new tests, the green pass rows of the test map and the full pr-pair suite pass. Flip the rows green.
- [x] 5.3 Update `skills/specwright-pr/SKILL.md` feedback step 2 (`resume`):
  - run `todo` react rows with `pr-reply.sh react`;
  - run ship step 5 for a `todo` link row, passing the row's `code.url` and `store.url` as `--peer-url`;
  - then plan again.

  Add the matching checks to `test_feedback_uses_pass_record_and_rounds` (red first), then verify they pass.
- [x] 5.4 Update `openspec/architecture.md` Known gaps: remove the #25 and #30 rows if listed. Verify by reading.

## 6. Finish resumes from git evidence (#48; D8)

- [x] 6.1 Add the agent evals to `evals/git-workflow/evals.json`, `fixtures.py` and `grade.py`:
  - `eval-finish-resume-after-archive-commit`: repo-local, `finish: local`, the change branch with task commits and an `archive change` commit, not merged. Prompt: the earlier finish was interrupted, finish `add-greeting`. Grade: exactly one archive commit, main has one `merge: add-greeting`, the branch is deleted, nothing pushed.
  - `eval-store-finish-resume-code-merge`: the store's main has `merge: add-greeting`, the store branch is deleted, the code branch has commits, and the code main has no merge. Grade: the code main gains `merge: add-greeting`, the code branch is deleted, and the store gets no new commit.

  Add the five change-finish text tests to `test_instructions.py`. Verify both evals and the text tests fail against the current skill.
- [x] 6.2 Add the **Resume** section to `skills/specwright-finish/SKILL.md` per D8:
  - the A/M/B facts per repo, and the next-step table, including the pr-mode merged row;
  - `Nothing to finish` only when every repo is done;
  - stop on dirty archive or change paths;
  - report when no archive is found;
  - no marker on resume.

  Branch lookup from main (review S7): `<prefix>/<change-name>` by the prefix rule, else a local `chore/archive-<change-name>`, else the one local branch matching `*/<change-name>`; several candidates → list them and ask. The archive subject regex is `^[a-z]+\(<change-name>\): archive change$`. Verify both evals pass (grade with `python evals/git-workflow/grade.py <iteration-dir>`), the text tests pass, and `eval-finish-local` and `eval-store-finish-local` still pass. Flip the rows green.
- [x] 6.3 Update `openspec/architecture.md`: the Local finish row in Failure and visibility (the resume path; drop the #48 clause), and Known gaps (remove the #48 row). Verify by reading; `git diff -- docs/adr` stays empty.

## 7. Closing references (#61 parts 1-2; D9)

- [x] 7.1 Add the red tests:
  - `test_closing_check_match`, `test_closing_check_reports_refs_after_one_keyword_as_missing`, `test_closing_check_extra_is_not_a_mismatch`, `test_closing_check_not_default_base` and `test_closing_check_lookup_failure_is_unknown` (closing list and default branch);
  - parser cases: refs in fenced and inline code ignored; `owner/repo#N` and issue URLs normalised; `Related: #N` not intended; `hasNextPage` → exit 3.

  Add the description and ship text tests from the test map to `test_skill_text.py`. Verify all fail (no subcommand, no text).
- [x] 7.2 Implement `pr-pair.sh closing-check` per D9 (one GraphQL read through the repo's login; normalised refs; `status` match/mismatch/not_default_base) and its header usage line. Verify the script tests pass and flip their rows green.
- [x] 7.3 Update `skills/specwright-pr/references/description.md` (one keyword per issue on its own line; `Related:` otherwise; closing lines on the PR in the issue's repo; cross-repo form when no PR is expected there; the store PR uses `Related: <owner>/<repo>#N`). Update `SKILL.md` ship step 4.3:
  - run `closing-check` after `ensure-pr`;
  - `not_default_base` → report;
  - `created` + mismatch → rewrite only reference-only closing lines, `gh pr edit --body-file`, check again, stop on a second mismatch;
  - `found` + mismatch → report and ask;
  - exit 3 → report the check as not done.

  Verify the text tests pass and flip their rows green.

## 8. Release 0.1.10 and integration

- [x] 8.1 Set `VERSION`, the README badge and `metadata.version` in all six `skills/*/SKILL.md` to 0.1.10. Verify with `grep -rn "0\.1\.9" VERSION README.md skills/*/SKILL.md` (no hits) and `grep -c "0\.1\.10"` on each.
- [x] 8.2 Run the full checks:
  - `python -m unittest discover evals/pr-pair` (including the Python 3.8 test via `uv python find 3.8`);
  - `python -m unittest discover evals/git-workflow -p "test_*.py"`;
  - `openspec validate fix-workflow-recovery --strict`;
  - `openspec schema validate specwright`.

  Verify every test map row is green, `git diff main -- docs/adr` is empty, and record any skipped test with its reason.

## 9. Cleanup backstop for closing references (#61 part 3; D10)

- [x] 9.1 Add the red tests `test_closed_check_lists_open_intended_issues`, `test_closed_check_all_closed`, `test_closed_check_ignores_related`, `test_closed_check_not_merged`, `test_closed_check_not_default_base`, `test_closed_check_reports_reopened`, `test_closed_check_does_not_read_outside_issues` (an outside issue whose read would fail does not make the check exit 3) and `test_closed_check_lookup_failure_is_unknown` (PR read and issue read), extending `evals/fakes/gh.py` with PR state and issue state and close history if needed (with `test_fake_gh.py` cases). Verify they fail (no subcommand).
- [x] 9.2 Implement `pr-pair.sh closed-check --repo o/n --pr N --repos o/n[,o/n]` per D10 (one GraphQL read of the PR, its base and the default branch through the repo's login; intended issues by D9's parser; only issues in `--repos`, compared case-insensitively, read through their repository's login, with their close history; `status` merged/not_merged/not_default_base; `open`, `reopened`, `closed`, `outside`; exit 3 on a failed read) and its header usage line. Verify the tests and flip their rows green.
- [x] 9.3 Update `skills/specwright-pr/SKILL.md` **Cleanup after merge** (run `closed-check` per merged PR with the change's repositories as `--repos`; close each `open` issue with `gh issue close --comment` naming the PR, under that repository's identity; report `reopened` and `outside` issues, never closing them; `not_merged` → nothing; `not_default_base` → close nothing and report; exit 3 → report the backstop as not done and continue; a failed close → report what was closed and what is still open, and continue) and `skills/specwright-finish/SKILL.md` **After the PR is merged** (point to it). Add `test_cleanup_closes_open_intended_issues`, `test_cleanup_reports_issues_outside_the_change`, `test_cleanup_reports_backstop_not_done`, `test_cleanup_closes_nothing_off_the_default_branch`, `test_cleanup_never_recloses_reopened` and `test_cleanup_reports_a_failed_close_and_continues` to `test_skill_text.py` (red first), then verify and flip the rows green.
- [x] 9.4 Update `openspec/architecture.md` where it describes post-merge cleanup or closing references, if it does. Verify by reading; `git diff main -- docs/adr` stays empty.

## 10. Local pre-ship review fixes

- [x] 10.1 Feedback step 2 handles a plan with `record: false` / `status: none` before the ownership gate, so a first pass proceeds. Add the check to `test_feedback_asks_before_adopting_a_foreign_record` (red first), then fix `skills/specwright-pr/SKILL.md` and verify.
- [x] 10.2 Add the red tests `test_unreadable_legacy_record_stops`, `test_unreadable_legacy_beside_valid_record_is_ignored`, `test_identical_legacy_copy_is_removed` and `test_failed_fallback_publish_leaves_no_record`, then fix `locate_record` (with no new-key record, an unreadable legacy file stops with `record_unreadable`; beside a valid record it is reported as ignored; a byte-identical legacy copy is removed) and `publish` (the fallback removes the destination it created when the write fails). Verify and flip the rows green.
- [x] 10.3 Add the red tests `test_resume_checks_out_main_before_deleting` and `test_resume_merge_requires_branch_tip_on_main` to `evals/git-workflow/test_instructions.py`, then update the **Resume** section of `skills/specwright-finish/SKILL.md` per D8 (M needs the branch tip on main when the branch exists; every deletion checks out `<main>` first). Verify and flip the rows green.
- [x] 10.4 Add the red tests `test_closing_check_ignores_multi_backtick_code_spans`, `test_closing_check_unmatched_backtick_is_literal` and `test_closing_check_reads_numbered_closing_lines`, then fix `without_code` (CommonMark code spans: a closer of the same run length; an unmatched run is literal) and the closing-line match in `pr-pair.sh` per D9. Verify and flip the rows green.
- [x] 10.5 In `evals/fakes/gh.py`, apply the repository reader check to the GraphQL repository path, and report `hasNextPage` when more than 100 closing references are seeded. Add `test_fake_gh.py` cases (red first), then verify `test_fake_gh.py` and the closing-check tests pass.
- [x] 10.6 Re-run the 8.2 checks. Verify every test map row is green and `git diff main -- docs/adr` is empty.

## 11. OMP pre-ship review fixes

- [x] 11.1 Add the red tests `test_closed_check_ignores_hidden_references` (an indented code block after a blank line, one directly after a heading, a code span across two lines, an HTML comment), `test_closed_check_ignores_related_on_a_closing_line` and `test_closed_check_ignores_a_line_without_a_closing_list` (`Fixes the crash; Related: #52`), then fix `without_code` and `intended_issues` in `pr-pair.sh` per D9 (indented code unless after a paragraph line; the closing list starts at a reference directly after the leading keyword and ends at any text other than separators or another closing keyword). Verify, including the existing `ClosingCheck` and `ClosedCheck` tests, and flip the rows green.
- [x] 11.2 Add the red test `test_resume_pr_mode_keeps_an_open_code_pr` to `evals/git-workflow/test_instructions.py`, then restrict the Resume row "store done; code branch with commits, code not M" in `skills/specwright-finish/SKILL.md` to `local` and add the two pr-mode rows per D8 (no PR or an open PR → ship; closed unmerged → report and ask). Verify and flip the row green.
- [ ] 11.3 Add the red tests `test_record_key_is_bounded_for_the_longest_names` (record and lock created; adopt and done work; a change name over 110 characters, whose 0.1.9 path is too long, still plans) and `test_legacy_move_finished_by_another_caller`, then cut the readable key prefix to 120 characters in `record_path`, treat a legacy file already gone at `unlink` as moved, and treat an old path the OS rejects as too long as absent, per D2. Verify and flip the rows green.
- [ ] 11.4 Re-run the 8.2 checks. Verify every test map row is green and `git diff main -- docs/adr` is empty.

## Workflow follow-up

- Verify, archive and finish per `finish: pr` (ship, watch, archive on the branch before merge).
- The PR description lists each fixed issue on its own `Fixes #N` line (#48, #25, #26, #29, #30, #32, #34, #61). After ship, confirm that `closing-check` reports a match, the first real use of the check.
- Publish 0.1.10 per the release rules.
