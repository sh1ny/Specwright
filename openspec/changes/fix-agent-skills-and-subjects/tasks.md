# Tasks

## Test map

Text checks (`test_instructions.py`) assert where a rule sits in the delivered skill, agent, schema or README text, by position and key terms, in the style of `evals/pr-pair/test_skill_text.py`. Agent evals (`evals.json`, graded by `grade.py`) cover the branch-state and stop paths, per CONTRIBUTING Testing.

| Requirement | Scenario | Test file | Test name | State |
|---|---|---|---|---|
| agent-delegation → Delegated agents can load named skills | Claude implementer loads a named skill | evals/git-workflow/test_instructions.py | test_claude_agents_list_skill_and_load_named_skills | green |
| agent-delegation → Delegated agents can load named skills | OMP reviewer loads a named skill | evals/git-workflow/test_instructions.py | test_omp_agents_read_the_given_skill_path | green |
| agent-delegation → Delegated agents can load named skills | Workflow skills stay with the orchestrator | evals/git-workflow/test_instructions.py | test_agents_never_invoke_specwright_skills | green |
| agent-delegation → Delegated agents can load named skills | Named skill is not installed | evals/git-workflow/test_instructions.py | test_agents_report_unloaded_skills | green |
| agent-delegation → Delegated agents can load named skills | Packet names no skills | evals/git-workflow/test_instructions.py | test_schema_packets_and_review_requests_name_skills_or_none | green |
| agent-delegation → Updated agent definitions need a new session | Update changes agent definitions | evals/git-workflow/test_instructions.py | test_install_report_requires_new_session_for_agents | green |
| agent-delegation → Updated agent definitions need a new session | Old session after update | evals/git-workflow/test_instructions.py | test_readme_probe_rejects_old_session | green |
| task-commits → Task subjects fit 72 characters | Long task text with backticks | evals/git-workflow/test_fit_subject.py; evals/git-workflow/evals.json | test_long_task_text_with_backticks; eval-apply-three-tasks (3 runs) | green |
| task-commits → Task subjects fit 72 characters | Subject exactly at the limit | evals/git-workflow/test_fit_subject.py | test_subject_exactly_72_is_unchanged | green |
| task-commits → Task subjects fit 72 characters | Store-backed task pair | evals/git-workflow/test_instructions.py; evals/git-workflow/evals.json | test_commit_skill_reuses_fitted_message_for_store_pair; eval-store-apply | green |
| task-commits → Task text is never run as shell input | Shell-like task text | evals/git-workflow/test_fit_subject.py | test_shell_like_text_stays_literal | green |
| task-commits → Unfittable subject stops the commit | Prefix plus first word too long | evals/git-workflow/test_fit_subject.py; evals/git-workflow/test_instructions.py | test_unfittable_subject_exits_1_and_keeps_file; test_commit_skill_stops_on_unfittable_subject | green |
| project-planning → ADRs stay proposed until the review gate passes | Baseline passes review | evals/git-workflow/test_instructions.py | test_roadmap_accepts_adrs_only_after_gate | red |
| project-planning → ADRs stay proposed until the review gate passes | Review asks to change a decision | evals/git-workflow/test_instructions.py | test_roadmap_writes_adrs_proposed | red |
| project-planning → ADRs stay proposed until the review gate passes | Close supersedes an accepted ADR | evals/git-workflow/test_instructions.py | test_roadmap_close_reviews_superseding_adr | red |
| project-planning → Baseline review rounds follow the schema's escalation rule | Two consecutive revise verdicts | evals/git-workflow/test_instructions.py | test_roadmap_review_escalates_after_two_consecutive_revise | red |
| project-planning → Baseline review rounds follow the schema's escalation rule | Edit after a passing verdict | evals/git-workflow/test_instructions.py | test_baseline_edit_after_pass_reruns_review | red |
| project-planning → Gap-closing roadmap edit is committed on the new change's branch | Criterion fails with no change left | evals/git-workflow/evals.json | eval-roadmap-next-gap | red |
| project-planning → Gap-closing roadmap edit is committed on the new change's branch | Branch gate stops | evals/git-workflow/evals.json | eval-roadmap-next-gap-dirty-main | red |
| planning-stores → Roadmap branches in a store go through the gate lock | Store is free | evals/git-workflow/test_instructions.py | test_roadmap_store_branch_under_gate_lock | red |
| planning-stores → Roadmap branches in a store go through the gate lock | Another session holds the lock | evals/git-workflow/evals.json | eval-store-roadmap-close-locked | red |
| planning-stores → Roadmap store writes check the branch | Store stays on the roadmap branch | evals/git-workflow/test_instructions.py | test_roadmap_store_commits_check_branch_in_same_call | red |
| planning-stores → Roadmap store writes check the branch | Store switched before a commit | evals/git-workflow/test_instructions.py | test_roadmap_store_writes_check_branch_and_stop_on_mismatch | red |
| pr-script-runtime → Pass records can be written on Python 3.8 | Pass write on Python 3.8 | evals/pr-pair/test_pr_pair.py | test_pass_write_on_python38 | red |
| pr-script-runtime → Pass records can be written on Python 3.8 | No Python 3.8 available to the test | evals/pr-pair/test_pr_pair.py | test_embedded_python_passes_no_newline_kwarg | red |
| pr-script-runtime → Unexpected failures keep the JSON error contract | Filesystem error during pass write | evals/pr-pair/test_pr_pair.py | test_unexpected_error_is_internal_error_json | red |
| pr-script-runtime → Unexpected failures keep the JSON error contract | Existing structured stop | evals/pr-pair/test_pr_pair.py | test_pass_write_refuses_an_existing_record_and_misrouted_edits | green |
| pr-script-runtime → Prerequisites are stated and checked at install | All prerequisites present | evals/git-workflow/test_instructions.py | test_install_checks_core_and_pr_prerequisites | red |
| pr-script-runtime → Prerequisites are stated and checked at install | Python missing | evals/git-workflow/test_instructions.py | test_install_reports_pr_workflow_not_ready | red |

Text checks prove the rule is in the instructions, not that a live agent follows it. Live delegation with `Skill` in a fresh Claude Code session is the user-verified M1 exit criterion. Task 1.4 prepares its probe; its result is recorded at milestone close, not here.

## 1. Delegated agents load named skills (#24; D1)

- [x] 1.1 Create `evals/git-workflow/test_instructions.py` with the seven agent-delegation tests from the test map (frontmatter `tools` of both Claude agents includes `Skill`; agent bodies: load only named skills, Claude by `Skill` and OMP by `read` of the given path, never `specwright-*`, report unloaded skills; schema DELEGATION and review requests name skills with paths or `none`; README Step 8 and CONTRIBUTING setup require a new session for skills and agents; README probe rejects an old session). Verify `python -m unittest discover evals/git-workflow -p "test_instructions.py"` fails on exactly those tests, for missing text.
- [x] 1.2 Update `agents/claude/specwright-{implementer,reviewer}.md` (add `Skill` to `tools`, plus the loading rules) and `agents/omp/specwright-{implementer,reviewer}.md` (`read` of the given path, same rules). Verify the four agent tests pass and flip their rows green.
- [x] 1.3 Update `schemas/specwright/schema.yaml`: the DELEGATION packet and the design-review request name the relevant installed skills with resolved `SKILL.md` paths, or `none`. Do the same for the baseline review request in `skills/specwright-roadmap/SKILL.md` init step 5. Verify `test_schema_packets_and_review_requests_name_skills_or_none` passes, then reinstall the schema copy and confirm `openspec schema validate specwright` passes. Flip the row green.
- [x] 1.4 Update README Step 8 and CONTRIBUTING Setup step 4 to say new skills and agent definitions load only in a new session. Add a short fresh-session probe to README Evals: dispatch `specwright-implementer` with a packet naming one installed skill and look for its `Skill` call, in a session started after install. Update the `specwright-implementer` row in `openspec/architecture.md` (component table) to mention named skills. Verify the two session tests pass and flip their rows green.

## 2. Task subjects fit 72 characters (#21; D2)

- [x] 2.1 Create `evals/git-workflow/test_fit_subject.py`, which runs the script through `bash` on temp message files. Cover the add-greeting backtick task, exactly 72 (unchanged), shell-like text with a sentinel file that must not appear, unfittable (exit 1, file byte-identical), missing file or malformed line 1 (exit 2), and body lines kept byte for byte. Verify the tests fail because `skills/specwright-commit/scripts/fit-subject.sh` does not exist.
- [x] 2.2 Write `skills/specwright-commit/scripts/fit-subject.sh` (bash + POSIX awk only) per D2. Verify all of `test_fit_subject.py` passes and flip the three script rows green.
- [x] 2.3 Update `skills/specwright-commit/SKILL.md` step 2: write the full message to the temp file, run `bash <skill dir>/scripts/fit-subject.sh <msgfile>`, and commit with `-F <msgfile>`. Reuse the same file for the store commit of a pair. On exit 1, make no commit and report the task, the subject and the limit. `allowed-tools` stays unchanged. Add the two commit-skill text tests to `test_instructions.py` (red first), then verify they pass and flip the store-pair and unfittable rows green.
- [ ] 2.4 Reinstall the skills into this repo. Run `eval-apply-three-tasks` three times in a row (with-skill, fresh fixtures) and `eval-store-apply` once. Grade with `python evals/git-workflow/grade.py <iteration-dir>`. Verify every run passes, including "Every commit subject is 72 characters or fewer", and record the iteration directories in the commit body.

## 3. Roadmap store gate and branch checks (#43; D3)

- [ ] 3.1 Add `eval-store-roadmap-close-locked` to `evals/git-workflow/evals.json`, `fixtures.py` and `grade.py`. Fixture: store-backed, M1 done, gate lock held with an owner file. Prompt: close M1. Grade: no `docs/close-*` branch in either repo, lock dir and `owner` byte-identical, store and code main unchanged. Add the three planning-stores text tests to `test_instructions.py`. Verify a run against the current skill fails the eval, and the text tests fail.
- [ ] 3.2 Update `skills/specwright-roadmap/SKILL.md` "Committing project files" for store-backed projects per D3. List the gate checks explicitly (take the lock with an owner, check the store is clean on main and not busy, create the branch, release only that lock) rather than citing `specwright-branch` step numbers. Add the branch check before each store write step and in the same call as each store commit, with a stop naming both branches. Verify the text tests and `eval-store-roadmap-close-locked` pass, then flip the four rows green.
- [ ] 3.3 Update `openspec/architecture.md` (the `specwright-roadmap` component row and the gate-lock ownership wording) to say roadmap branching takes the store gate lock. Leave the frozen Known gaps table unchanged. Re-run `eval-store-branch-locked` and `eval-store-branch-stale-lock` and verify they still pass.

## 4. ADR status and baseline review rounds (#44, #49; D4, D5)

- [ ] 4.1 Add the five project-planning text tests (ADR and review rows) to `test_instructions.py`. Verify they fail against the current roadmap and PR skills.
- [ ] 4.2 Update `skills/specwright-roadmap/SKILL.md` per D4 and D5:
  - init step 4 writes ADRs `Status: proposed`;
  - init step 5 drops "at most two rounds" and uses the schema rule;
  - on gate pass: accept with the date and add the in-force index rows, without voiding the verdict, then write the roadmap;
  - close step 5 writes the superseding ADR as proposed, reviews it like init step 5, and accepts it only after the gate passes.

  Verify the four roadmap tests pass and flip their rows green.
- [ ] 4.3 Add D5's rule to `skills/specwright-pr/SKILL.md` feedback: on `docs/project-baseline` or `docs/close-*`, a fix that edits the strategy, architecture or an ADR re-runs the roadmap baseline review before the fix is reported done. Verify `test_baseline_edit_after_pass_reruns_review` and `python -m unittest discover evals/pr-pair` pass, then flip the row green.
- [ ] 4.4 Update `openspec/architecture.md`: the Design review row in Resource bounds (D5's rule), and the "Gap:" clause of the Architecture file and ADRs row (#44 now fixed). Leave the Known gaps table and accepted ADR files unchanged. Verify with `git diff -- docs/adr` (empty) and a read of the two rows.

## 5. Gap-closing roadmap edit (#50; D6)

- [ ] 5.1 Add `eval-roadmap-next-gap` and `eval-roadmap-next-gap-dirty-main` to `evals/git-workflow/evals.json`, `fixtures.py` and `grade.py`. Fixture: repo-local, every M1 change archived on main, an agent-verified criterion that fails. Prompt: run next, accept the proposed change, and only scaffold it. Grade (clean main):
  - main unchanged;
  - the change branch has exactly one commit that changes only the roadmap file and adds the change name;
  - the change directory exists.

  Grade (dirty main): the roadmap file is unchanged and no roadmap commit exists on any branch. Verify a run against the current skill fails the clean-main case.
- [ ] 5.2 Update roadmap **next** steps 3 and 4 per D6: propose without editing; after `specwright-branch` creates the branch, add the entry and commit only the roadmap file as `docs(<change-name>): add <change-name> to the roadmap` (store-backed: with D3's branch check), then continue propose. Verify both evals pass and flip both rows green.
- [ ] 5.3 Update `openspec/architecture.md`'s Strategy and roadmap ownership row: replace the #50 "Gap:" clause with the new behavior. Note in the commit body that D6 commits after the branch gate, not before it as the roadmap entry phrased it. Verify by reading the row; `git diff -- docs/adr` stays empty.

## 6. PR script runtime and prerequisites (#45, #46; D7, D8)

- [ ] 6.1 Add three tests to `evals/pr-pair/test_pr_pair.py`:
  - `test_embedded_python_passes_no_newline_kwarg`: always run; scans the script's embedded Python.
  - `test_unexpected_error_is_internal_error_json`: the record's parent path is a regular file; expect a single JSON line, `internal_error`, exit 1, no `Traceback`.
  - `test_pass_write_on_python38`: finds a 3.8 interpreter via `SPECWRIGHT_PY38`, then `uv python find 3.8`, then `py -3.8`; puts `python3`/`python` shims on `PATH`; runs a valid store-backed `pass write` and checks the record parses with no CR bytes. When no 3.8 is found, it calls `skipTest` naming the missing interpreter.

  Install 3.8 with `uv python install 3.8`. Verify all three fail for the right reason (the newline kwarg, a traceback, `TypeError`).
- [ ] 6.2 Fix `skills/specwright-pr/scripts/pr-pair.sh` per D7: replace the write with the `open(..., newline="\n")` form and add an `except Exception` emitting `internal_error`. Update the header's needs line and exit-code text. Verify the three new tests pass on the uv 3.8 interpreter, and that `python -m unittest discover evals/pr-pair` passes in full, including the existing structured-stop test. Flip the three rows green and re-confirm the green row.
- [ ] 6.3 Update the README prerequisites, install Step 1 and Step 8 per D8: core is git plus bash with a POSIX userland, which stop the install when missing; PR-only is gh 2.40+ and Python 3.8+, which produce `PR workflow not ready: <missing>` without blocking the stamp. Also update the `specwright-pr` SKILL.md dependency line and CONTRIBUTING Setup and Testing (Python 3.8+, and how to run the 3.8 test with `uv python install 3.8`). Add the two install text tests (red first), then verify they pass and flip their rows green.

## 7. Versioning rule, 0.1.9 and integration

- [ ] 7.1 Add the pre-1.0 versioning rule to CONTRIBUTING Releases: minor for a feature, configuration key or workflow change; patch for a fix; 1.0 is the maintainer's call. Set `VERSION`, the README badge and `metadata.version` in all six `skills/*/SKILL.md` to 0.1.9. Verify with `grep -rn "0\.1\.8" VERSION README.md skills/*/SKILL.md` (no hits) and `grep -c "0\.1\.9"` on each.
- [ ] 7.2 Run the full checks: `python -m unittest discover evals/git-workflow -p "test_*.py"`, `python -m unittest discover evals/pr-pair`, `openspec validate fix-agent-skills-and-subjects --strict` and `openspec schema validate specwright`. Verify every test map row is green, `git diff main -- docs/adr` is empty and the Known gaps table is unchanged. Record any skipped test with its reason.

## Workflow follow-up

- Verify, archive and finish per `finish: pr` (ship, watch, archive on the branch before merge).
- The user runs the README fresh-session probe for the M1 `Skill` criterion after reinstalling and restarting.
- Close #24, #21, #43, #44, #49, #50, #45 and #46 when the PR merges; publish 0.1.9 per the release rules.
