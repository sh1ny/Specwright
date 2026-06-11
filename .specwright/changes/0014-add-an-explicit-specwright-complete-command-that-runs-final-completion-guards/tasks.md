# Tasks

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Wave 1 — Command surface and git primitives

- [x] T001: Add complete command parsing
  - Files: `src/core/types.ts`, `src/core/commands.ts`, `test/core-commands.test.ts`
  - Action: Add complete-specific mode types/constants, parse `complete [<change>] [--mode none|push|pr|merge]`, default omitted mode to `none`, add dispatch/help, and keep publish parsing unchanged.
  - Acceptance: `complete` accepts only complete modes; invalid modes fail clearly; `publish --mode merge` still fails; help lists complete usage.
  - Verification: Run targeted parser/help tests with `bun test test/core-commands.test.ts -t "complete"` and publish mode regression with `bun test test/core-commands.test.ts -t "publish"`.

- [x] T002: Add completion git helpers
  - Files: `src/core/git.ts`, `test/core-commands.test.ts`
  - Action: Add helpers for clean-worktree detection, switching to an existing local branch, and `git merge --no-ff --no-edit <branch>` using argv arrays.
  - Acceptance: Helpers do not create branches, pull, delete branches, or shell-concatenate commands; detached/missing branch/dirty cases surface failures.
  - Verification: Run focused git behavior tests with `bun test test/core-commands.test.ts -t "complete"`.

## Wave 2 — Fail-closed final guards

- [x] T003: Add git and change preflight guards
  - Files: `src/core/commands.ts`, `src/core/git.ts`, `test/core-commands.test.ts`
  - Action: Before mode side effects, require git worktree, non-detached current branch, resolved change, branch/change match, not-on-base branch, clean worktree, and resolvable base.
  - Acceptance: Each failing preflight exits before push, PR creation, branch switch, merge, state mutation, or artifact writes.
  - Verification: Run targeted failure tests with `bun test test/core-commands.test.ts -t "complete"`.

- [x] T004: Add lifecycle artifact and evidence guards
  - Files: `src/core/commands.ts`, `src/core/validators.ts`, `test/core-commands.test.ts`
  - Action: Reuse `validateChange`, require existing all-checked tasks, require non-empty `verify.md` and `handoff.md`, and fail when observed verification evidence is missing.
  - Acceptance: Incomplete/missing tasks, validation failure, missing final artifacts, or missing observed evidence fail before every mode side effect.
  - Verification: Run focused guard tests with `bun test test/core-commands.test.ts -t "complete"`.

## Wave 3 — Completion mode side effects

- [ ] T005: Implement complete mode actions
  - Files: `src/core/commands.ts`, `src/core/git.ts`, `test/core-commands.test.ts`
  - Action: Implement `none`, `push`, `pr`, and `merge` after guards: no-op success, existing branch push, push plus existing PR creation path, and switch-to-base plus no-fast-forward merge.
  - Acceptance: `none` has no side effects; `push` pushes once; `pr` pushes then opens PR with existing body behavior; `merge` creates a no-fast-forward merge commit on base; merge conflicts fail visibly and leave conflict state; no branch deletion occurs.
  - Verification: Run real-repo mode tests with `bun test test/core-commands.test.ts -t "complete"`.

## Wave 4 — Documentation and regression checks

- [ ] T006: Document complete and protect publish behavior
  - Files: `README.md`, `src/core/commands.ts`, `test/core-commands.test.ts`
  - Action: Document complete usage, default mode, guard expectations, mode side effects, and that publish remains remote-only; add regression coverage where needed.
  - Acceptance: README/help agree on syntax and default; docs state no default branch deletion and no automatic base pull; publish behavior remains none/push/pr only.
  - Verification: Run targeted documentation/help and publish regression tests with `bun test test/core-commands.test.ts -t "complete|publish"`.

