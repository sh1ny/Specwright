# Spec Delta

## ADDED Requirements

### Requirement: Roadmap branches in a store go through the gate lock
When roadmap **init** or **close** creates its project-file branch in a store, it SHALL take the store's exclusive gate lock (the one `specwright-branch` uses) before checking the store, and SHALL release only the lock it took, right after the branch exists. A lock held by another session SHALL stop it before any branch or write.

#### Scenario: Store is free
- **WHEN** close runs against a store that is clean on main with no gate lock
- **THEN** it creates `docs/close-m1` in the store while holding the lock, and the lock no longer exists after the branch is created

#### Scenario: Another session holds the lock
- **WHEN** close runs while the store's gate lock exists, owned by another session's change
- **THEN** close creates no branch in either repo, writes no project file, leaves the lock and its owner file unchanged, and shows the owner

### Requirement: Roadmap store writes check the branch
For store-backed roadmap **init** and **close**, each step that writes project files in the store SHALL first confirm, in a shell call, that the store is on the expected branch. Each store commit SHALL run that check in the same shell call as the commit. On a mismatch it SHALL stop without further writes or commits and name both branches.

#### Scenario: Store stays on the roadmap branch
- **WHEN** the store is on `docs/project-baseline` throughout init
- **THEN** every project-file commit lands on `docs/project-baseline` in the store

#### Scenario: Store switched before a commit
- **WHEN** another session switches the store to `feat/add-csv-export` after close wrote its files but before it commits
- **THEN** close makes no commit, `feat/add-csv-export` gains no commit, and the report names `docs/close-m1` as expected and `feat/add-csv-export` as found
