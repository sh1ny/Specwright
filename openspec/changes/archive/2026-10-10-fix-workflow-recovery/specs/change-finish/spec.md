# Spec Delta

## Purpose

Lets `specwright-finish` complete a change that an earlier finish run left partly done, by reading which finish steps git already shows as done instead of repeating or skipping them.

## ADDED Requirements

### Requirement: Finish resumes from git evidence
When finish runs again for a change it already archived, it SHALL derive what is done from git in each repo of the change: an archive commit on the change branch, a `merge: <change-name>` commit on main's first-parent history (which counts for an existing change branch only when that branch's tip is on main), and whether the change branch still exists. It SHALL continue from the first step not done and SHALL NOT repeat a done step.

#### Scenario: Interrupted after the archive commit, local mode
- **WHEN** a repo-local change in `finish: local` has its archive commit on the change branch, the branch is not merged, and finish runs again
- **THEN** no second archive commit is made, main gets one `merge: <change-name>` commit, and the change branch is deleted

#### Scenario: Interrupted after the merge, before the branch deletion
- **WHEN** main already has `merge: <change-name>` and the change branch still exists, fully merged
- **THEN** finish makes no new merge commit and deletes the branch with `git branch -d`

#### Scenario: Resumed on the branch it deletes
- **WHEN** finish resumes with the change branch checked out, and that branch is fully merged into main
- **THEN** finish checks out main before running `git branch -d`, and the branch is deleted

#### Scenario: Archive-recovery branch after the change merged
- **WHEN** main has `merge: <change-name>` from the change's earlier merge, and `chore/archive-<change-name>` holds an archive commit that is not on main
- **THEN** finish does not treat that repo as merged and does not delete the branch: it continues with that branch's next step (ship in `finish: pr`, merge in `finish: local`)

#### Scenario: Store merged by hand, code PR still open
- **WHEN** a store-backed change in `finish: pr` has its store branch merged by hand (a store with no GitHub origin), and the code branch's PR is still open
- **THEN** finish does not merge the code branch or delete it, and ships it: the open code PR is reported

#### Scenario: Interrupted after the archive commit, pr mode
- **WHEN** a change in `finish: pr` has its archive commit on the change branch, not yet pushed, and finish runs again
- **THEN** no second archive commit is made, and ship pushes the branch and reports the PR

#### Scenario: Every repo already done
- **WHEN** every repo of the change has `merge: <change-name>` on main and no change branch left
- **THEN** finish reports `Nothing to finish - archive is on <main>` and makes no commit, merge or branch deletion

#### Scenario: Archive commit not found
- **WHEN** finish runs for a change that has no change directory, no archive commit on its branch and no archive on main
- **THEN** finish makes no commit or merge and reports that it found no archive of the change

#### Scenario: Archive committed on the branch but archive paths dirty
- **WHEN** the archive commit is on the change branch and a file under the archive directory has uncommitted changes
- **THEN** finish merges nothing, lists that file, and asks the user

### Requirement: Finish resume keeps the planning-only test and each repo's scope
A resumed finish SHALL run the planning-only test before an archive commit it still has to make. It SHALL NOT merge, ship or delete the code repo's branch after a store-only archive recovery, and SHALL count a code repo with no archive commit, merge or branch beside a finished store as done only when the store's archive marks the change as having no code changes.

#### Scenario: Interrupted before the archive commit, planning-only change
- **WHEN** a store-backed planning-only change was archived but finish stopped before step 2, so the archive paths are uncommitted and no archive commit exists, and finish runs again
- **THEN** the planning-only test runs and writes `specwright-change.yaml` with `code_changes: none` before the archive commit

#### Scenario: Planning-only change already finished
- **WHEN** a store-backed planning-only change finished locally (store merged, empty code branch deleted), and finish runs again
- **THEN** both repos are done, and finish reports `Nothing to finish - archive is on <main>`

#### Scenario: Interrupted store-only archive recovery
- **WHEN** a store-only archive recovery (`chore/archive-<change-name>` in the store) finished its store merge and was interrupted, and the code repo has a change branch with commits not on main
- **THEN** finish does not merge, ship or delete the code branch, and reports it
