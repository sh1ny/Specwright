# Proposal

## Why

Milestone **M1 - Hardening**, change 2 of 3 (release 0.1.10). An interrupted or concurrent feedback pass, or an interrupted finish, still needs manual git or PR rescue:

- finish cannot resume after its archive commit or between the two merges;
- a pass can end before its reaction is sent, or accept an intent that later blocks every pass;
- a recovered partial fix is counted as an extra round;
- an adopted code PR can stay unlinked;
- two sessions can run the same pass, and two repositories can share a record file;
- a repo-local PR cannot recover a pass at all.

This change advances the exit criteria "every issue in the changes below is closed by a merged PR, with a regression test" and "`evals/pr-pair` passes". It serves the milestone outcome: a change runs from branch to merged PR, including an interrupted or concurrent feedback pass, without manual git or PR rescue.

**Scope addition, approved by the user on 2026-10-10:** #61 parts 1 and 2. PR #59 listed eight issues after a single `Fixes` keyword, so GitHub closed only the first, and the other seven had to be closed by hand. The roadmap's exit criterion "every issue is closed by a merged PR" depends on closing keywords working, so this belongs in M1. It is small and touches `specwright-pr` ship, which this change already edits.

**Scope addition, approved by the user on 2026-10-10 (after the local pre-ship review):** #61 part 3, the backstop at cleanup, so this change closes #61 and M1's exit criterion can be met. The same review's findings on this change's own code are fixed here too (see the last bullet of What Changes).

## What Changes

- **#48** `specwright-finish` resumes from git evidence. On re-entry it reads, per repo: is the archive committed on the branch, is `merge: <change-name>` on main, does the branch still exist? It continues from the first missing step, and the archive commit is never repeated. This covers an interruption after the archive commit and one between the store merge and the code merge (local mode). In pr mode a resumed finish skips the archive commit and ships.
- **#25** A pass record is removed only once each recorded reaction is confirmed on GitHub. `pass plan` reads whether this account's 👍/👎 is on the target comment instead of assuming an idempotent rerun. The `rerun` state goes away.
- **#26** `pass write` validates the whole intent before writing: `branch` is a non-empty string, `round` a positive integer, and `prs` an object whose `code`/`store` entries are null or `{repo: "<owner>/<name>", number: <positive int>}`. A malformed intent is refused with `invalid_intent`.
- **#29** `rounds` uses the legacy `address review feedback` subject count only when neither repo has a `Feedback-Round` trailer. A recovered partial fix (a second commit with the same trailer) no longer counts as a round.
- **#30** When `pass plan` adopts a code PR it discovered, the plan gets a `link` row, and the pass cannot complete until both PRs link each other. The row's state comes from the PR bodies and marker comments, and the existing idempotent `link` repairs it. A regression test reproduces the interruption first, since the issue is unverified.
- **#32** The pass record has an owner. `pass write` creates it exclusively, so two sessions cannot both start a pass. The record stores an owner id, and `pass done` (and the new `pass adopt`) check that owner. A record owned by another session stops the run and shows the owner. Like the store gate lock, it is never taken over automatically: the user confirms it is stale, then `pass adopt` hands it over. Record files get a collision-free key, and a record under the old name is moved to its new name when its contents match.
- **#34** Repo-local changes use the same pass record, `rounds` and resume plan as store-backed ones (`--store` becomes optional). A pass interrupted after its last allowed fix was pushed finishes its replies under its own round instead of taking the after-limit path.
- **#61 (parts 1-2)** `references/description.md` requires one closing keyword per issue, each on its own line. After ship creates or finds a PR, a new `pr-pair.sh closing-check` compares the issues GitHub will close (`closingIssuesReferences`) with the issues the body's closing lines name:
  - on a PR ship just created, a mismatch gets a body rewritten with one keyword per issue, then a second check;
  - on an existing PR, ship reports the mismatch and asks, since the description belongs to the user once it exists.

  Closing lines go on the PR in the repo that holds the issues (normally the code PR).
- **#61 (part 3)** After a PR merges, cleanup runs a new `pr-pair.sh closed-check`: it reads the issues the PR's closing lines name and closes any still open with a comment naming the PR. Issues outside the change's repositories are reported, not closed. This covers PRs merged before the check existed and anything the check missed.
- **Local review fixes** (findings on this change's code before ship): feedback step 2 handles `status: none` before the ownership gate; a legacy record that cannot be read stops instead of allowing a new pass; a legacy record left byte-identical by an interrupted move is removed; a failed fallback publish removes the file it created; finish resume treats a change as merged only when the branch tip is on main, and checks out main before deleting a branch; `closing-check` skips code spans of any backtick length and reads ordered-list closing lines; the fake `gh` applies the reader check to GraphQL and reports overflow past 100 closing references.
- Everything moves to 0.1.10. The roadmap's change 2 entry names #61 (all three parts) and the user's approvals.

## Capabilities

### New Capabilities
- `feedback-passes`: the feedback pass record (exclusive creation and an owner, collision-free keys, intent validation) and pass recovery for repo-local changes.
- `change-finish`: `specwright-finish` resumes an interrupted finish from git evidence.
- `pr-descriptions`: closing references in PR descriptions are one per issue and are checked against what GitHub will close.

### Modified Capabilities
- `planning-stores`: **Feedback rounds span the PR pair** (a recovered partial fix is not a round); **An interrupted feedback pass is completed first** (reactions confirmed before removal; a discovered code PR is linked before completion); **Local finish merges the repos that have work** (resume between the store merge and the code merge).

## Impact

- Scripts: `skills/specwright-pr/scripts/pr-pair.sh`:
  - `pass write|plan|done` change: ownership, key, validation, react evidence, link row, optional `--store`;
  - new `pass adopt`, `closing-check` and `closed-check`;
  - `rounds` changes: legacy count only, optional `--store`.
- Skills: `specwright-pr` (SKILL.md: ship, feedback steps 2, 3, 6 and 10, repo-local notes, cleanup after merge; `references/description.md`) and `specwright-finish` (resume step, after the PR is merged). `metadata.version` changes in all six skills.
- Docs: README badge, `VERSION`, `openspec/architecture.md` (the rows that describe pass records and finish), `openspec/roadmap.md` (change 2 entry). Accepted ADRs are not edited.
- Tests: `evals/pr-pair/test_pr_pair.py` (pass ownership, keys and migration, validation, reactions, link row, repo-local pass, rounds, closing-check) and `test_skill_text.py`. New agent evals in `evals/git-workflow` for the two finish interruption points.
- State: a pass record written by 0.1.9 is moved to its new key on first use. A 0.1.9 record has no owner, so its first resume asks the user, like any record another session owns.
- Out of scope: PR evidence freshness (#31, #33, #35, #39, #47: change 3), watch-key collisions (#39).
