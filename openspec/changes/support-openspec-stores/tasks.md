# Tasks

## Test map

Test kinds:
- **Agent eval** = a case in `evals/git-workflow/evals.json`, with its fixture in `fixtures.py` and its checks in `grade.py`. It runs the real skill against real git repos, with OpenSpec state isolated (D12).
- **Script test** = a `unittest` case under `evals/pr-pair/` that runs the real scripts against real git repos and the fake `gh` from group 1. GitHub cannot be reached offline. Its decisions are therefore made by `skills/specwright-pr/scripts/pr-pair.sh`, which the tests drive directly; `test_skill_text.py` checks that SKILL.md calls it.

| Requirement | Scenario | Test file | Test name | State |
|---|---|---|---|---|
| planning-stores → Planning root comes from OpenSpec | Store selected by a project pointer | evals/git-workflow/evals.json | eval-store-apply | red |
| planning-stores → Planning root comes from OpenSpec | Repo-local project is unchanged | evals/git-workflow/evals.json | eval-apply-three-tasks, eval-finish-local, eval-branch-clean-main (new check: only the code repo changed) | red |
| planning-stores → Planning root comes from OpenSpec | Root found after archive | evals/git-workflow/evals.json | eval-store-finish-local | red |
| planning-stores → Planning root comes from OpenSpec | Date-prefixed change name found after archive | evals/git-workflow/evals.json | eval-store-finish-dated | red |
| planning-stores → Planning root comes from OpenSpec | Declared store cannot be resolved | evals/git-workflow/evals.json | eval-store-unregistered | red |
| planning-stores → Planning root comes from OpenSpec | Root in another worktree of the code repo | evals/git-workflow/evals.json | eval-store-other-worktree | red |
| planning-stores → Planning paths are relative to the resolved root | Root nested in the code repo | evals/git-workflow/evals.json | eval-nested-root-finish | red |
| planning-stores → Planning paths are relative to the resolved root | Path outside every repository | evals/git-workflow/evals.json | eval-root-outside-git | red |
| planning-stores → Store branch mirrors the code branch | Both repos clean on main | evals/git-workflow/evals.json | eval-store-branch-clean | red |
| planning-stores → Store branch mirrors the code branch | Store is dirty | evals/git-workflow/evals.json | eval-store-branch-dirty | red |
| planning-stores → Store branch mirrors the code branch | Store checkout busy with another change | evals/git-workflow/evals.json | eval-store-branch-busy | red |
| planning-stores → The store gate is exclusive | Two sessions start changes against one store at once | evals/git-workflow/evals.json | eval-store-branch-locked (the fixture holds the lock as the other session; the race itself is the atomic `mkdir`) | red |
| planning-stores → The store gate is exclusive | Gate lock left by an interrupted session | evals/git-workflow/evals.json | eval-store-branch-stale-lock | red |
| planning-stores → Planning commits go to the store | Planning artifacts committed before the first task | evals/git-workflow/evals.json | eval-store-apply | red |
| planning-stores → Planning commits go to the store | Task commit for a store-backed change | evals/git-workflow/evals.json | eval-store-apply | red |
| planning-stores → Planning commits go to the store | Store on the wrong branch | evals/git-workflow/evals.json | eval-store-apply-wrong-branch | red |
| planning-stores → Task commit pairs are reconciled before new work | Normal code task | evals/git-workflow/evals.json | eval-store-apply (check: no no-op question in the report) | red |
| planning-stores → Task commit pairs are reconciled before new work | Store commit failed, apply resumes | evals/git-workflow/evals.json | eval-store-apply-reconcile | red |
| planning-stores → Task commit pairs are reconciled before new work | Reconciliation cannot isolate the tick | evals/git-workflow/evals.json | eval-store-apply-multi-gap | red |
| planning-stores → A tick without a code commit is confirmed | Restart before a task's code commit | evals/git-workflow/evals.json | eval-store-apply-orphan-tick | red |
| planning-stores → A tick without a code commit is confirmed | No-op task's store commit failed | evals/git-workflow/evals.json | eval-store-apply-noop-gap | red |
| planning-stores → Completion check covers both repos | All tasks committed in both repos | evals/git-workflow/evals.json | eval-store-apply | red |
| planning-stores → Completion check covers both repos | Store has uncommitted tasks.md | evals/git-workflow/evals.json | eval-store-complete-gap | red |
| planning-stores → Planning-only changes are recorded in the archive | Planning-only archive | evals/git-workflow/evals.json | eval-store-finish-planning-only | red |
| planning-stores → Planning-only changes are recorded in the archive | Planning-only archive of a date-prefixed change | evals/git-workflow/evals.json | eval-store-finish-dated | red |
| planning-stores → Planning-only changes are recorded in the archive | Code work appears after the marker | evals/pr-pair/test_pr_pair.py | test_pass_plan_removes_marker_before_code_fix | red |
| planning-stores → Archive commit goes to the store | Archive committed in the store | evals/git-workflow/evals.json | eval-store-finish-local | red |
| planning-stores → Archive commit goes to the store | Archive ran with the store on main | evals/git-workflow/evals.json | eval-store-archive-on-main | red |
| planning-stores → Archive commit goes to the store | Archive recovery while the code PR is open | evals/git-workflow/evals.json | eval-store-archive-on-main-pr-open | red |
| planning-stores → Local finish merges the repos that have work | Both merges succeed | evals/git-workflow/evals.json | eval-store-finish-local | red |
| planning-stores → Local finish merges the repos that have work | Planning-only change in local mode | evals/git-workflow/evals.json | eval-store-finish-planning-only | red |
| planning-stores → Local finish merges the repos that have work | Store merge conflicts | evals/git-workflow/evals.json | eval-store-finish-store-conflict | red |
| planning-stores → Local finish merges the repos that have work | Code merge conflicts after the store merged | evals/git-workflow/evals.json | eval-store-finish-code-conflict | red |
| planning-stores → Commands run where they resolve correctly | Store push with a repository-local auth header | evals/pr-pair/test_as_sh.py | test_scrubs_header_local_to_the_store | red |
| planning-stores → Commands run where they resolve correctly | Store login override | evals/pr-pair/test_pr_pair.py | test_context_login_per_repo | red |
| planning-stores → Commands run where they resolve correctly | Schema lookup with a root nested in the store repo | evals/git-workflow/evals.json | eval-install-nested-store | red |
| planning-stores → The expected PR set follows the change's work and transport | Planning-only change with a GitHub store | evals/pr-pair/test_pr_pair.py | test_expected_planning_only_github_store | red |
| planning-stores → The expected PR set follows the change's work and transport | Planning-only change with no GitHub store | evals/pr-pair/test_pr_pair.py | test_expected_planning_only_local_store | red |
| planning-stores → The expected PR set follows the change's work and transport | Code fix turns a planning-only change into a pair | evals/pr-pair/test_pr_pair.py | test_expected_gains_code_pr_after_code_commit | red |
| planning-stores → The expected PR set follows the change's work and transport | Fresh watch after the code PR merged | evals/pr-pair/test_pr_pair.py | test_pair_state_merged_code_pr_stays_expected | red |
| planning-stores → PR finish pairs the store PR with the code PR | Ship opens both PRs | evals/pr-pair/test_pr_pair.py | test_ship_sequence_links_both | red |
| planning-stores → PR finish pairs the store PR with the code PR | Code PR already open without the link | evals/pr-pair/test_pr_pair.py | test_link_existing_code_pr_by_comment | red |
| planning-stores → PR finish pairs the store PR with the code PR | Ship re-run after an interrupted first run | evals/pr-pair/test_pr_pair.py | test_ship_sequence_rerun_is_idempotent | red |
| planning-stores → PR finish pairs the store PR with the code PR | Code PR replaced after closing unmerged | evals/pr-pair/test_pr_pair.py | test_link_updates_own_comment_for_new_peer | red |
| planning-stores → PR finish pairs the store PR with the code PR | Existing code PR targets another branch | evals/pr-pair/test_pr_pair.py | test_ensure_pr_stops_on_wrong_base | red |
| planning-stores → PR finish pairs the store PR with the code PR | Fetch and push URLs name different repositories | evals/pr-pair/test_pr_pair.py | test_identity_fetch_push_mismatch | red |
| planning-stores → PR finish pairs the store PR with the code PR | Matching PR beyond the first page | evals/pr-pair/test_pr_pair.py | test_discover_paginates_past_fork_prs | red |
| planning-stores → PR finish pairs the store PR with the code PR | Inherited GH_REPO names the code repo | evals/pr-pair/test_pr_pair.py | test_gh_repo_env_ignored | red |
| planning-stores → PR finish pairs the store PR with the code PR | Store push rejected | evals/git-workflow/evals.json | eval-store-ship-push-rejected | red |
| planning-stores → Watch covers the expected PR set | Code PR green, store PR waiting | evals/pr-pair/test_pr_pair.py | test_pair_state_waits_for_both | red |
| planning-stores → Watch covers the expected PR set | Store PR alone is ready | evals/pr-pair/test_pr_pair.py | test_pair_state_single_store_pr_ready | red |
| planning-stores → Watch covers the expected PR set | One PR of the pair merged | evals/pr-pair/test_pr_pair.py | test_pair_state_split_hands_off | red |
| planning-stores → Watch covers the expected PR set | Archive before merge with no store PR | evals/git-workflow/evals.json | eval-store-archive-before-merge-local-store | red |
| planning-stores → Feedback rounds span the PR pair | Spec fix requested on the code PR | evals/pr-pair/test_pr_pair.py | test_pass_plan_routes_spec_fix_to_store | red |
| planning-stores → Feedback rounds span the PR pair | Round limit across both repos | evals/pr-pair/test_pr_pair.py | test_rounds_highest_across_branches | red |
| planning-stores → Feedback rounds span the PR pair | Finishing an interrupted final pass | evals/pr-pair/test_pr_pair.py | test_pass_plan_final_pass_push_pending | red |
| planning-stores → An interrupted feedback pass is completed first | Interrupted between the two fix commits | evals/pr-pair/test_pr_pair.py | test_pass_plan_missing_store_commit | red |
| planning-stores → An interrupted feedback pass is completed first | Interrupted after both pushes | evals/pr-pair/test_pr_pair.py | test_pass_plan_rerequest_and_replies_pending | red |
| planning-stores → An interrupted feedback pass is completed first | Commit made but not recorded | evals/pr-pair/test_pr_pair.py | test_pass_plan_commit_found_by_trailer | red |
| planning-stores → An interrupted feedback pass is completed first | Reply posted, then its resolution failed | evals/pr-pair/test_pr_pair.py | test_pass_plan_reply_done_resolution_pending | red |
| planning-stores → An interrupted feedback pass is completed first | Reviewer follow-up during the interruption | evals/pr-pair/test_pr_pair.py | test_pass_plan_stale_disposition_stops | red |
| planning-stores → An interrupted feedback pass is completed first | Interrupted halfway through a spec fix | evals/pr-pair/test_pr_pair.py | test_pass_plan_partial_edit_not_committable | red |
| planning-stores → An interrupted feedback pass is completed first | Review requests disabled | evals/pr-pair/test_pr_pair.py | test_pass_plan_rerequest_not_applicable | red |
| planning-stores → An interrupted feedback pass is completed first | Pass with an open question thread | evals/pr-pair/test_pr_pair.py | test_pass_plan_question_thread_done_when_replied | red |
| planning-stores → Cleanup after merge covers every expected PR | Both PRs merged | evals/pr-pair/test_pr_pair.py | test_cleanup_plan_both_merged | red |
| planning-stores → Cleanup after merge covers every expected PR | Only one PR merged | evals/pr-pair/test_pr_pair.py | test_cleanup_plan_split | red |
| planning-stores → Cleanup after merge covers every expected PR | Cleanup re-run after the store PR merges | evals/pr-pair/test_pr_pair.py | test_cleanup_plan_rerun_code_branch_gone | red |
| planning-stores → Roadmap status needs proof that the whole change merged | Both repos merged | evals/git-workflow/evals.json | eval-store-roadmap-local, eval-store-roadmap-pr | red |
| planning-stores → Roadmap status needs proof that the whole change merged | Date-prefixed change merged | evals/git-workflow/evals.json | eval-store-roadmap-local | red |
| planning-stores → Roadmap status needs proof that the whole change merged | Code partly integrated | evals/git-workflow/evals.json | eval-store-roadmap-pr | red |
| planning-stores → Roadmap status needs proof that the whole change merged | Same branch name merged from a fork | evals/git-workflow/evals.json | eval-store-roadmap-pr | red |
| planning-stores → Roadmap status needs proof that the whole change merged | Code PR merged into another branch | evals/git-workflow/evals.json | eval-store-roadmap-pr | red |
| planning-stores → Roadmap status needs proof that the whole change merged | Planning-only change squash-merged | evals/git-workflow/evals.json | eval-store-roadmap-pr | red |
| planning-stores → Roadmap status needs proof that the whole change merged | Store fetch fails | evals/git-workflow/evals.json | eval-store-roadmap-pr | red |
| planning-stores → Referenced stores are read-only | Apply in a repo with references | evals/git-workflow/evals.json | eval-references-apply | red |
| planning-stores → Referenced stores are read-only | Referenced store is not registered | evals/git-workflow/evals.json | eval-references-unregistered | red |
| planning-stores → Install targets the resolved root | Install into a store-backed project | evals/git-workflow/evals.json | eval-install-store | red |
| planning-stores → Install targets the resolved root | Store already uses another schema | evals/git-workflow/evals.json | eval-install-store-other-schema | red |

## 1. Two-repo test harness

- [x] 1.1 Add a store fixture builder to `evals/git-workflow/fixtures.py`. It builds `<dest>/code` and `<dest>/store` (both `main`, eval identity), registers the store with `openspec store` under `XDG_DATA_HOME=<dest>/xdg-data`, uses `XDG_CONFIG_HOME=<dest>/xdg-config` and `SPECWRIGHT_STATE_DIR=<dest>/state`, and writes those three plus `PATH=<dest>/bin:$PATH` to `<dest>/eval.env`. Repo-local fixtures keep their current layout. Verify: `python evals/git-workflow/fixtures.py eval-store-branch-clean <tmp>`, then `openspec list --json` run in `<tmp>/code` with `eval.env` loaded reports `root.store_id` and a `root.path` under `<tmp>/store`, and the user's real registry is unchanged.
- [x] 1.2 Add the fake `gh` at `evals/fakes/gh.py` with a `bin/gh` shim. It covers `auth token`, `api user`, `api --paginate repos/<o>/<n>/pulls?...` (30 per page unless `--paginate`, filtered by `head=<owner>:<branch>`), `pr create/view/comment/edit`, `api -X PATCH .../issues/comments/<id>` and `repo view`. State lives in `$FAKE_GH_STATE`, and every call is appended to `$FAKE_GH_LOG`. Verify: `python -m unittest evals/pr-pair/test_fake_gh.py` (created here) passes.
- [x] 1.3 Extend `grade.py` to grade a run with both `repo/code` and `repo/store` (helpers `subjects(repo, rng)` per repo, store status, fake-gh log). Document how to load `eval.env` for skill-creator runs in the README "Evals" section, and add `python -m unittest discover evals/pr-pair` there. Verify: `python evals/git-workflow/grade.py <iteration-dir>` still grades the existing five cases unchanged.

## 2. Planning repo resolution (D1, D2)

- [x] 2.1 Add agent evals `eval-store-apply`, `eval-store-unregistered`, `eval-store-other-worktree`, `eval-nested-root-finish` and `eval-root-outside-git` (fixtures plus grade checks), and add the "only the code repo changed" check to `eval-apply-three-tasks`, `eval-finish-local` and `eval-branch-clean-main`. Run them against the current skills and confirm the new ones fail for the expected reason (for example, commit stops with "Specwright does not commit planning stores").
- [x] 2.2 Write the shared "Planning repo" procedure (D1, D2) and add it to `specwright-branch`, `-commit`, `-finish`, `-pr` and `-roadmap` SKILL.md:
  - `openspec list --json` (plus `--store` when the session selected one);
  - the `--git-common-dir` + `--show-toplevel` comparison, with the stop for another worktree;
  - the declared-store and outside-git stops;
  - root-relative paths;
  - the two working directories by command kind;
  - the archive-name rule.

  Replace the store stop in `specwright-commit` (`SKILL.md:19`). Verify: the evals from 2.1 pass for their resolution checks (store root found, unresolved store stop, worktree stop, nested root, outside-git stop), and the repo-local evals still pass.
- [x] 2.3 Update the reviewer agents (`agents/claude/specwright-reviewer.md`, `agents/omp/specwright-reviewer.md`) and the implementers to resolve the planning root the same way and to run `openspec templates --schema specwright --json` in `<root.path>`. Verify: `rg -n "openspec/schemas/specwright/templates" agents/` finds no fixed repo-local path.

## 3. Branch gate for stores (D3)

- [ ] 3.1 Add agent evals `eval-store-branch-clean`, `-dirty`, `-busy`, `-locked` and `-stale-lock`. Confirm they fail against the current `specwright-branch` (no store branch, no lock handling).
- [ ] 3.2 Extend `specwright-branch`:
  - take the gate lock (`mkdir <store common dir>/specwright-gate.lock` plus an `owner` file) before the store checks, and release it on every exit;
  - run the checks on both repos, with store main detection from `planning_store.main_branch`;
  - create the code branch, then the store branch, rolling back the code branch if the store fails;
  - stop on a busy store, and on a held or stale lock (remove it only after the user confirms);
  - announce both repos.

  Verify: the five evals from 3.1 pass and flip rows 9–13 green. `eval-branch-*` still pass.

## 4. Planning and task commits (D4)

- [ ] 4.1 Add agent evals `eval-store-apply-wrong-branch`, `-reconcile`, `-multi-gap`, `-orphan-tick`, `-noop-gap` and `eval-store-complete-gap`. Confirm they fail for the expected reason.
- [ ] 4.2 Rewrite the store parts of `specwright-commit`:
  - planning and drift commits go in the store, by path, on the store branch, with a branch check fused into the same shell call;
  - task pairs: code commit first, then the store tick with the same subject;
  - reconcile before any tick or commit, excluding the task this session is committing now;
  - a gap without a code commit stops and asks (no-op → `Code-Changes: none`; changed code → code commit, then the tick);
  - the completion check is reported per repo.

  Verify: `eval-store-apply` and the 4.1 evals pass, flipping rows 1, 14–23 and the remaining checks of 2.1 green. `eval-apply-three-tasks` still passes.

## 5. Finish: archive, planning-only marker, local merge (D5 local part, D2 archive rule)

- [ ] 5.1 Add agent evals `eval-store-finish-local`, `-dated`, `-planning-only`, `-store-conflict`, `-code-conflict`, `eval-store-archive-on-main` and `-archive-on-main-pr-open`; the last one uses a fake-gh open code PR. Confirm they fail against the current `specwright-finish`.
- [ ] 5.2 Update `specwright-finish`:
  - the archive commit goes in the store, staged by file, with the archive directory found by the archive-name rule (`archivedAs` when available);
  - the planning-only test (no code commits and no code PR in any state; a failed lookup writes no marker and stops) and the `specwright-change.yaml` marker;
  - the `chore/archive-<name>` recovery with the same test;
  - local mode: `--no-ff` merge of the store, then the code repo if it has commits, with the empty code branch deleted with `-d`;
  - the conflict stops, including the split-state report.

  Verify: the 5.1 evals pass and flip rows 3, 4, 24, 25, 27–33 green. `eval-finish-local` still passes.

## 6. PR-pair decisions script (D5 pr part, D7, D8, D6 identity)

- [ ] 6.1 Write `evals/pr-pair/test_pr_pair.py` and `evals/pr-pair/test_as_sh.py` with every script-test row of the test map. Use real git repos with GitHub-form remotes, a local bare repo reached through `url.<bare>.insteadOf` only where a test needs a working push and does not exercise `identity`, and the fake `gh`. Confirm every test fails because `pr-pair.sh` does not exist yet, and that `test_scrubs_header_local_to_the_store` passes against today's `as.sh` when run inside the store (which documents the D1 requirement).
- [ ] 6.2 Implement `skills/specwright-pr/scripts/pr-pair.sh` subcommands, each printing one JSON line:
  - `identity <dir>`: fetch URL plus every push URL → `<owner>/<name>`, or a mismatch or not-GitHub error;
  - `context`: per-repo login, main, validate and reviewers from `specwright.yaml` and `planning_store:`;
  - `discover --repo <o/n> --branch <b> [--base <main>] [--state ...]`: complete paginated discovery; a failure means unknown, with exit 3;
  - `expected`: the expected PR set;
  - `ensure-pr`: find or create, stopping on a wrong base;
  - `link`: a marker comment carrying the peer URL, edited when the peer changes;
  - `pair-state`: the watch action table;
  - `rounds`: the highest `Feedback-Round` across both branches;
  - `pass write|plan`: the intent record and the evidence-based resume plan, including stale-disposition and partial-edit stops;
  - `cleanup-plan`.

  Every `gh` call takes an explicit `--repo` or `repos/<o>/<n>`, with `GH_REPO` unset. Verify: `python -m unittest discover evals/pr-pair` passes, flipping rows 26, 34, 35, 37–48, 50–52 and 54–67 green.

## 7. specwright-pr wiring (D5, D6, D7, D8)

- [ ] 7.1 Add `evals/pr-pair/test_skill_text.py`. It checks mechanically that `skills/specwright-pr/SKILL.md` calls `pr-pair.sh identity` before any push, uses `discover` instead of `gh pr list` for change PRs, runs `link` after both PRs exist, and uses `pair-state`, `pass` and `cleanup-plan` in watch, feedback and cleanup. Add agent evals `eval-store-ship-push-rejected` (fake gh; the store push fails through an unreachable `http.proxy` in `eval.env`) and `eval-store-archive-before-merge-local-store`. Confirm they fail.
- [ ] 7.2 Rewrite the ship, watch, feedback and after-limit sections of `skills/specwright-pr/SKILL.md` for the expected PR set:
  - store commands run inside the store with `planning_store` settings;
  - ship order: store first, then code, then link;
  - one wait per expected PR, with `--repo`;
  - feedback routes fixes by path, adds the `Feedback-Round` trailer, writes the pass record, and resumes first;
  - archive-before-merge pushes only when a store PR is expected;
  - post-merge cleanup.

  Also update `references/description.md` (store PR body, "no code changes" note, store PR link). Verify: `test_skill_text.py` and the two evals from 7.1 pass (rows 49 and 53 green), and `python -m unittest discover evals/pr-pair` still passes.
- [ ] 7.3 Add the commented `planning_store:` block to `templates/openspec/specwright.yaml` (D6), with `{}` for no reviewers and the `<root.path>` working directory noted for `validate`. Verify: the file parses with `python -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" templates/openspec/specwright.yaml`.

## 8. Roadmap status (D9)

- [ ] 8.1 Add agent evals `eval-store-roadmap-local` and `eval-store-roadmap-pr`. Their fixtures hold several archived changes covering every roadmap row: merged with `merge: <name>`, date-prefixed, a cherry-picked task only, a fork PR with the same branch name, a merge into `integration`, planning-only squash-merged, and a fetch that cannot reach `origin`. Use the fake gh for PR proof. Confirm they fail against the current `specwright-roadmap`.
- [ ] 8.2 Update `specwright-roadmap`:
  - read archives from the store's main by the archive-name rule;
  - proof is the marker, a first-parent `merge: <name>` (local), or complete discovery of a MERGED code PR into main from the code repo itself (pr);
  - report "planning merged, code pending", "code unverified" or "code state unknown";
  - stale-store note on a failed fetch;
  - `next` uses only done changes.

  Verify: the 8.1 evals pass and flip rows 68–74 green.

## 9. References mode (D11)

- [ ] 9.1 Add agent evals `eval-references-apply` and `eval-references-unregistered`. Confirm the unregistered case fails today: the report does not name the unresolved reference.
- [ ] 9.2 Add the read-only rule to the five skills and the design/review guidance: never branch, commit or push in a referenced store; read references via `openspec context --json`; name an unresolved reference and continue. Verify: both evals pass (rows 75–76 green).

## 10. Install and docs (D10)

- [ ] 10.1 Add agent evals `eval-install-store`, `eval-install-store-other-schema` and `eval-install-nested-store`. Confirm they fail against today's install prompt, which writes to the code repo's `openspec/`.
- [ ] 10.2 Update the README install/update prompt:
  - run `openspec list --json` first;
  - put the schema and `config.yaml` `context:` under `<root.path>/openspec/`, with `specwright.yaml`, skills and agents in the code repo;
  - never create `openspec/specs/` or `openspec/changes/` in the code repo when the root is elsewhere;
  - run `openspec schema validate specwright` inside `<root.path>`;
  - ask before replacing another schema;
  - list the uncommitted store files.

  Verify: the three evals pass (rows 36, 77, 78 green).
- [ ] 10.3 Add the README "Stores" section: OpenSpec ≥ 1.14.1; pointer, `defaultStore` and `--store`; one change in progress per store per machine, plus the gate lock; the PR pair and the expected PR set; `planning_store:`; references; the `Feedback-Round` trailer note for repo-local projects. Verify: every setting the section names exists in `templates/openspec/specwright.yaml` or the OpenSpec CLI help (`openspec store --help`).

## 11. Release and integration

- [ ] 11.1 Bump `metadata.version` in each changed SKILL.md and the repo `VERSION`. Verify: `git diff main -- VERSION skills/*/SKILL.md | rg "version"` shows one bump per changed skill.
- [ ] 11.2 Integration check: run the whole agent-eval suite (with-skill) and `python -m unittest discover evals/pr-pair`. Grade with `grade.py`, and confirm every test map row is green and the existing five evals still pass. Run `openspec validate support-openspec-stores --strict`.

## Workflow follow-up

- Archive the change with `/opsx:archive` once the PR is ready, then `specwright-finish`.
