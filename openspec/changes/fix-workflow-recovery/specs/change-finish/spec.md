# Spec Delta

## Purpose

Lets `specwright-finish` complete a change that an earlier finish run left partly done, by reading which finish steps git already shows as done instead of repeating or skipping them.

## ADDED Requirements

### Requirement: Finish resumes from git evidence
When finish runs for a change whose archive is already committed, it SHALL derive what is done from git in each repo of the change: an archive commit on the change branch, a `merge: <change-name>` commit on main's first-parent history (which counts for an existing change branch only when that branch's tip is on main), and whether the change branch still exists. It SHALL continue from the first step not done and SHALL NOT repeat a done step.

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
