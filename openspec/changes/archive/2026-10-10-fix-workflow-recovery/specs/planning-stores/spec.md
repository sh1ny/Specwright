# Spec Delta

## MODIFIED Requirements

### Requirement: Local finish merges the repos that have work
With `finish: local`, a store-backed change SHALL be merged into main with `--no-ff` in the store, then in the code repo if its branch has commits, and each merged branch deleted with `git branch -d`. An empty code branch SHALL be deleted unmerged with `-d`. If the store merge conflicts, the code repo SHALL be left unmerged. Nothing SHALL be pushed.

#### Scenario: Both merges succeed
- **WHEN** finish runs in local mode, the code branch has commits, and neither repo has a merge conflict
- **THEN** each repo's main has a merge commit `merge: <change-name>`, both change branches are deleted, and the report names both merge commits and says nothing was pushed

#### Scenario: Planning-only change in local mode
- **WHEN** finish runs in local mode and the code branch has no commits
- **THEN** only the store's main gets `merge: <change-name>`, the code branch is deleted, and the report says the change had no code changes

#### Scenario: Store merge conflicts
- **WHEN** the store's merge into main conflicts
- **THEN** Specwright stops, lists the conflicting store files, offers manual resolution or `git merge --abort`, and leaves the code repo on its change branch with no merge commit

#### Scenario: Code merge conflicts after the store merged
- **WHEN** the store merge succeeded and the code merge then conflicts
- **THEN** Specwright stops, lists the conflicting code files, and reports that the store's main has the change while the code repo does not

#### Scenario: Interrupted between the store merge and the code merge
- **WHEN** the store's main has `merge: <change-name>` and the store branch is deleted, the code branch has commits after main, the code main has no `merge: <change-name>`, and finish runs again
- **THEN** finish does not report `Nothing to finish`, makes no store commit or merge, merges the code branch into the code main as `merge: <change-name>`, and deletes the code branch

### Requirement: Feedback rounds span the PR pair
For a store-backed change, one feedback pass SHALL cover every expected PR. A fix to `<root>/openspec/**` SHALL be committed on the store branch, and any other fix on the code branch, whichever PR the finding came from. Each fix commit SHALL carry the trailer `Feedback-Round: <n>`. The round limit SHALL count the highest `n` across both branches and SHALL apply only to starting a new pass. Fix commits without a trailer SHALL be counted by their `address review feedback` subject only when neither branch has a `Feedback-Round` trailer.

#### Scenario: Spec fix requested on the code PR
- **WHEN** a reviewer on the code PR asks for a change to a requirement in the change's spec delta
- **THEN** the fix is committed with `Feedback-Round: <n>` and pushed on the store branch, review is re-requested on the store PR, and the reply on the code PR links the store commit

#### Scenario: Round limit across both repos
- **WHEN** `max_fix_rounds` is 2, earlier passes committed `Feedback-Round: 1` on the store branch and `Feedback-Round: 2` on the code branch, and both branches are pushed
- **THEN** the next pass makes no fix in either repo and answers findings per `after_limit`

#### Scenario: Finishing an interrupted final pass
- **WHEN** `max_fix_rounds` is 2 and pass 2 committed in both repos but the store push failed
- **THEN** the next run pushes the store commit, re-requests review on the store PR and answers that pass's findings, without counting a new round or taking the after-limit path

#### Scenario: Recovered partial fix
- **WHEN** `max_fix_rounds` is 2 and round 1 was finished after an interruption by a second `address review feedback` commit carrying `Feedback-Round: 1`
- **THEN** the round count is 1, the limit is not reached, and the next pass is round 2

#### Scenario: Legacy branch without trailers
- **WHEN** neither branch has a `Feedback-Round` trailer and the code branch has two `address review feedback` commits
- **THEN** the round count is 2

### Requirement: An interrupted feedback pass is completed first
A feedback pass SHALL record its round, findings, their destination repos, the edits each fix needs and each finding's intended disposition before its first fix. A run that finds a record SHALL finish that pass under its original round before any new fix, even at the round limit, reading each step's progress from git and GitHub so that no action is repeated. The record SHALL be removed once every applicable step of the pass is done, as limited by the settings and each finding's disposition. A reaction counts as done only when GitHub shows it; a code PR adopted by the pass counts as linked only when both PRs link each other.

#### Scenario: Interrupted between the two fix commits
- **WHEN** `max_fix_rounds` is 2 and pass 2 committed its code fix but stopped before committing its store fix
- **THEN** the next run makes the store fix recorded for pass 2 with `Feedback-Round: 2`, publishes both, and answers pass 2's findings, without starting pass 3

#### Scenario: Interrupted after both pushes
- **WHEN** pass 2 pushed both fix commits and stopped before re-requesting review and replying
- **THEN** the next run re-requests review on both PRs and posts pass 2's replies, and no new fix is made

#### Scenario: Commit made but not recorded
- **WHEN** pass 2's code fix commit exists on the code branch but the run stopped before anything else
- **THEN** the next run makes no second code fix commit, and pushes and answers pass 2 from that commit

#### Scenario: Reply posted, then its resolution failed
- **WHEN** pass 2's reply to a thread was posted, and resolving the thread failed before the run stopped
- **THEN** the next run posts no second reply to that thread, and lists the thread's pending resolution for the user

#### Scenario: Reviewer follow-up during the interruption
- **WHEN** pass 2 pushed its fixes and stopped before its first reply, and the reviewer then added a follow-up to a pass 2 thread or edited its finding
- **THEN** the next run posts no reply or resolution for that thread from the old pass, and lists the new activity and asks the user

#### Scenario: Interrupted halfway through a spec fix
- **WHEN** a pass 2 fix needs edits to an archived spec delta and its main spec, and the run stopped after editing only the archived delta
- **THEN** the next run edits the main spec as recorded before committing, and answers the finding only after the commit contains both edits

#### Scenario: Review requests disabled
- **WHEN** `github.review_request.body` is empty, `pr.reviewers` is unset, and pass 2's fixes are pushed and its findings answered
- **THEN** the pass record is removed and no review request is posted

#### Scenario: Pass with an open question thread
- **WHEN** pass 2 answered one thread with a question back to the reviewer, without resolving it, and finished its other steps
- **THEN** the pass record is removed and that thread stays unresolved

#### Scenario: Reply posted, reaction not sent
- **WHEN** `pr.react` is true, pass 2's reply to a finding was posted, and the run stopped before its recorded reaction was added
- **THEN** the next plan lists that reaction as to do, `pass done` keeps the record, and the record is removed only after GitHub shows the reaction on the finding

#### Scenario: Reaction already present
- **WHEN** pass 2's reply and its recorded reaction are both on GitHub
- **THEN** the plan lists the reaction as done and adds no second reaction

#### Scenario: Code PR adopted before the pair was linked
- **WHEN** a store-only change's pass 2 made the first code fix, ship opened the code PR, and the run stopped before linking the PRs
- **THEN** the next plan lists a link step as to do, the pass does not complete until each PR links the other, and each PR then has exactly one link to its peer
