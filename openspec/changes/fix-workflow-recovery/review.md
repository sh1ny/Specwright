# Review

## Metadata

- **Round:** 1
- **Prior round:** none
- **Reviewer:** fresh-context subagent (Claude Code, Claude Agent SDK reviewer); Required Changes re-checked by the same reviewer in a separate run
- **Reviewed:** proposal.md, design.md, specs/feedback-passes/spec.md, specs/change-finish/spec.md, specs/pr-descriptions/spec.md, specs/planning-stores/spec.md (MODIFIED, compared with openspec/specs/planning-stores/spec.md); skills/specwright-pr/scripts/pr-pair.sh (record_path, pass_write, pass_plan, pass_done, cmd_rounds, cmd_link, cmd_ensure_pr, contexts), skills/specwright-pr/scripts/pr-snapshot.sh (shaping of threads, comments and reviews), skills/specwright-pr/scripts/pr-reply.sh, skills/specwright-pr/SKILL.md (ship 4.3 and 5, feedback 2, 3, 6, 10, repo notes), skills/specwright-pr/references/description.md, skills/specwright-finish/SKILL.md, evals/pr-pair/test_pr_pair.py (`rerun` assertions); openspec/architecture.md (pass record, rounds and local finish rows), openspec/roadmap.md (M1 change 2), docs/adr/0002, 0003, 0004, 0006; GitHub issue sh1ny/specwright#61. The re-check read design.md D3, D7, D8 and D9, all of specs/pr-descriptions/spec.md, the new scenarios in specs/feedback-passes/spec.md and specs/change-finish/spec.md, and the output of `openspec validate fix-workflow-recovery` (valid).

<!-- This verdict covers only the contents reviewed. Editing proposal, specs or design afterward (other than applying Required Changes) voids it. -->

## Findings

### Critical (blocking)

None.

### Moderate

**M1. D4 reads a thread's reaction through `root_id`, but D3 does not validate `root_id`. A bad intent can again block every later pass (#26 class).**
D4 sends a thread finding's reaction read to `repos/<repo>/pulls/comments/<id>/reactions` with the numeric root comment id. In `pass_plan` that id is `f.get("root_id")` (`pr-pair.sh:1156`). `pass_write` does not require `root_id` or check its type (`pr-pair.sh:911`). D3 adds checks for `branch`, `round` and `prs` only. Today a missing `root_id` is harmless because the row only becomes `rerun`. Under D4, a thread finding with a reaction and a missing, null or non-numeric `root_id` makes every plan's reaction read fail with exit 3 (unknown). The record can then never reach `complete` and `pass done` never removes it. That is the failure #26 is meant to remove: an accepted intent that later blocks every pass. The same applies to `item` for `comment` and `review` findings: it must be a node id string that GraphQL `node(id:)` can resolve.

**M2. D7's link test compares exact URL substrings, but the record holds only `repo` and `number`, and the design does not say where the row gets its peer URLs.**
`cmd_link` treats a PR as linked when `peer in body`, or when a marker's URL `== peer` (`pr-pair.sh:655`, `:664`). Both are exact, case-sensitive string tests. The record's `prs` entries hold `{repo, number}` only, and the repo slug is whatever the intent said. D2 itself relies on repo names being case-insensitive. Suppose the plan builds `https://github.com/<repo>/pull/<n>` from a slug whose case differs from GitHub's canonical URL. The row then stays `todo` even when the description already links the peer. Rerunning `link` with that constructed URL posts a second marker. That breaks the spec's "each PR then has exactly one link to its peer". If the skill passes GitHub's canonical URL instead, `link` skips and the row never turns `done`, so the pass never completes. The row's evidence and the repair command must use the same URL, and it must be the URL GitHub reports.

**M3. D9 ignores that closing keywords work only on PRs into the repository's default branch.**
GitHub interprets closing keywords, and fills `closingIssuesReferences`, only when the PR's base is the default branch. #61 says so itself ("A closing keyword only takes effect when the PR merges into the default branch"). Specwright allows a main other than the default (`main_branch`, `planning_store.main_branch`; finish SKILL.md step 4). For such a repo, every created PR with a `Fixes` line follows the same path: `linked` is empty, mismatch, rewrite, second mismatch. The `Still missing after the rewrite` scenario then stops ship and withholds `ready` on every ship. The cause is unrelated to the description. The check needs a distinct outcome for that case, and the spec needs a scenario for it.

**M4. D9 and the description rule leave a planning-only store-backed change unable to close its issues.**
D9 tells the store PR to use `Related: <owner>/<repo>#N` and to put closing lines "on the PR in the repository that holds the issues (normally the code PR)". A planning-only change has no code PR (`description.md`: "When there is no code PR ... planning-only"). Its issues in the code repo then never get a closing keyword from any PR, so they stay open after merge. That is the exit-criterion failure this scope addition exists to prevent. GitHub closes cross-repository issues from `Fixes <owner>/<repo>#N` on a PR merged into the default branch, so the store PR can carry them when no PR exists in the issue's repository.

### Suggestions

**S1. GitHub may update closing references late (Open Question).** The second check runs right after `gh pr edit`. If GitHub computes `closingIssuesReferences` asynchronously, the stale second read stops ship with a false "still missing". Re-read a bounded number of times (for example 3 reads a few seconds apart) before the rewrite and before the stop.

**S2. Define `mismatch` as a non-empty `missing` list.** D9 says `extra` is informational, but the `status` field does not say whether `extra` alone means `mismatch`. On a `found` PR with sidebar-linked issues, ship would otherwise ask on every re-ship (each feedback round and the archive). Also consider asking about a given `found` PR's mismatch once per session, not on every ship.

**S3. Rewriting from `intended` can promote a passing reference to a closing one.** The parser counts every reference on a line that starts with a keyword, so `Fixes #21 (see also #52)` marks #52 as intended. The automatic rewrite would then add `Fixes #52` and close an issue the PR does not resolve. Limit the automatic rewrite to closing lines that hold only references and separators. Report any other mismatch instead of rewriting it.

**S4. D8 does not say how `<branch>` and the archive subject's `<type>` are found when finish runs from main.** Today both come from the current branch ("Commit type: the branch prefix"). In the "M and B" case after the code merge, both repos are on main. Find the branch with `git for-each-ref refs/heads/*/<change-name>` (more than one result → ask). Match the archive subject as `^[a-z]+\(<change-name>\): archive change$` rather than with a known type.

**S5. D8 pr-mode resume after the PR merged on GitHub.** After a squash merge the branch still shows A on the branch, so the table routes to ship, and `ensure-pr` stops with `already_merged`. Add a row that sends a merged PR to "After the PR is merged" (or `specwright-pr` Cleanup after merge for store-backed changes).

**S6. Spec coverage.** Add scenarios for:
- a leftover `<record>.lock` (`record_busy` names the path, and nothing is removed);
- finish re-run when every repo is already done (`Nothing to finish`);
- a repo-local intent with a non-null `prs.store` (D3 refuses it, but no scenario covers it).

**S7 (from the re-check, non-blocking). Fix the wording of D8's branch lookup.** D8's "Finding the branch from main" says the `*/<change-name>` match includes `chore/archive-<change-name>`. That glob does not match the recovery branch: its last segment is `archive-<change-name>`. Either add `chore/archive-<change-name>` as a separate pattern or drop the parenthetical. Otherwise a resume that should consider the recovery branch will not find it. The result is safe either way: the change branch or "ask" still applies.

## Verdict

VERDICT: APPROVE_WITH_CHANGES

## Required Changes

1. **design.md D3 and specs/feedback-passes "A pass intent is validated before it is written" (M1).**
   - D3: for `kind: thread` (the default), `pass write` requires `root_id` to be an `int` (not a bool) ≥ 1. For `comment` and `review` findings, `item` must be a non-empty string. Otherwise it refuses with `invalid_intent` naming `root_id` or `item`.
   - Spec: add a scenario. WHEN a thread finding has no `root_id` (or `root_id` is `"abc"`), THEN `pass write` exits with `invalid_intent` naming `root_id`, and no record exists.
2. **design.md D7 (M2).**
   - State that the `link` row reads each PR's canonical URL from GitHub (`url`/`html_url` of `repos/<repo>/pulls/<n>`, through the same per-repo login) and does not build it from the record's slug.
   - The row's output carries `code.url` and `store.url`. The skill passes exactly those URLs as `--peer-url` to the two `link` calls.
   - The shared linked-test function compares against those URLs.
3. **design.md D9 and specs/pr-descriptions "Closing references are checked after ship" (M3).**
   - `closing-check` also reads the PR's `baseRefName` and the repository's `defaultBranchRef`. When they differ, it prints `status: not_default_base` with the intended issues. Ship then does not rewrite the description and does not stop. It reports that GitHub will not close the listed issues from this PR.
   - Add a spec scenario: WHEN ship creates a PR into a branch other than the repository's default branch and its description has `Fixes #21`, THEN the check reports that the base is not the default branch, the description is not edited, and ship reports that #21 will not be closed by this PR.
4. **design.md D9, specs/pr-descriptions "One closing keyword per issue", and the planned `references/description.md` wording (M4).**
   - State that when no PR is expected in the repository that holds an issue (for example, a planning-only store-backed change whose issues are in the code repo), the PR that does exist carries the closing line in cross-repository form, `Fixes <owner>/<repo>#N`. The check normalises both sides to `owner/repo#N`.
   - Add a spec scenario: WHEN a planning-only store-backed change fully resolves code-repo issue 21, THEN the store PR's description has `Fixes <code owner>/<code repo>#21` on its own line.

<!-- yes (applied, and re-checked by the reviewer - only the reviewer sets it) | no (outstanding) | n/a (any other verdict) -->
CHANGES_APPLIED: yes

## Rebuttals

Author, round 1:

- **M1:** fixed. D3 requires `root_id` (int ≥ 1, not a bool) for thread findings and a non-empty `item` for comment and review findings. New scenario "Thread finding without a usable root id" in `specs/feedback-passes`.
  - **Reviewer:** verified. D3's last bullet and the scenario at `specs/feedback-passes/spec.md:70-72` match Required Change 1. Accepted by reviewer.
- **M2:** fixed. In D7, the `link` row reads each PR's canonical `html_url` from GitHub through the repo's login, never from the slug. It carries `code.url` and `store.url`, the linked test compares against them, and the skill passes exactly those URLs as `--peer-url`.
  - **Reviewer:** verified. D7's bullets on the row shape, the `html_url` source and the `--peer-url` hand-off match Required Change 2. Accepted by reviewer.
- **M3:** fixed. D9's `closing-check` reads `baseRefName` and `defaultBranchRef` and prints `not_default_base`; ship then neither rewrites nor stops. Because the requirement text exceeded 500 characters, this became its own requirement in `specs/pr-descriptions`, "Closing references need the default branch", with the requested scenario plus "Default branch cannot be read".
  - **Reviewer:** verified. The design's one GraphQL read, its `not_default_base` status and the ship routing, plus the separate requirement and its two scenarios, match Required Change 3. Splitting it into its own requirement is fine. Accepted by reviewer.
- **M4:** fixed. D9 and the "One closing keyword per issue" requirement: when no PR is expected in the repo that holds the issue, the existing PR carries `Fixes <owner>/<repo>#N`, and both sides are normalised to `owner/repo#N`. New scenario "Planning-only store-backed change".
  - **Reviewer:** verified. The D9 description bullet and normalisation step, the requirement's last sentence and the new scenario match Required Change 4. Accepted by reviewer.
- **S1:** rebutted. D9 already re-reads once: on a created PR, a mismatch leads to a rewrite and a second check. A third read would only delay a real stop. If late computation shows up in practice, the stop names the issues and the user can re-run ship.
  - **Reviewer:** accepted by reviewer. It is a suggestion, and the stop names the issues, so a false stop is visible and cheap to retry.
- **S2:** applied. `status` is `match` when `missing` is empty; `extra` never makes a mismatch. New scenario "Issue linked by hand only".
  - **Reviewer:** verified; it introduces no new problem.
- **S3:** applied. The rewrite touches only closing lines that hold nothing but a keyword and references; any other closing line is left as is and reported.
  - **Reviewer:** verified. It stays consistent with the "Several issues after one keyword" scenario, whose line holds only a keyword and references.
- **S4:** applied. D8 says how the branch is found from main (the prefix rule, else the one `*/<change-name>` branch, else ask) and that the archive subject matches `^[a-z]+\(<change-name>\): archive change$`.
  - **Reviewer:** verified, with one wording slip: the glob does not match `chore/archive-<change-name>` (see S7, non-blocking).
- **S5:** applied. D8 has a row for pr mode with the branch's PR merged: cleanup, not ship.
  - **Reviewer:** verified; it introduces no new problem.
- **S6:** applied. New scenarios "Lock left by an interrupted handover" and "Repo-local intent names a store PR" (`feedback-passes`), and "Every repo already done" (`change-finish`).
  - **Reviewer:** verified. The scenarios are assertable and consistent with D1, D3 and D8. `openspec validate fix-workflow-recovery` reports the change valid.
