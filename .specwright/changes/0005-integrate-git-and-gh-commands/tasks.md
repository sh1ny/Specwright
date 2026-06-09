# Tasks

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Wave 1: Workflow config and execution foundation

- [x] T001: Add workflow config keys
  - Files: `src/core/types.ts`, `src/core/state.ts`, `src/core/commands.ts`, `src/core/validators.ts`, `test/core-commands.test.ts`, `test/core-validators.test.ts`
  - Action: Extend config shape, defaults, merge logic, config descriptors, and validation for `workflow.autoCommit`, `workflow.publishMode`, `workflow.baseBranch`, and `workflow.remote`.
  - Acceptance: `specwright config get/set` supports the new typed keys; defaults are auto-commit enabled, publish mode `none`, remote `origin`, and no base override.
  - Verification: Run the focused config/validator Bun tests covering valid defaults, valid overrides, and invalid publish modes/remotes.

- [x] T002: Add git and gh runner
  - Files: `src/core/git.ts`, `src/core/commands.ts`, `test/core-commands.test.ts`
  - Action: Add argument-array process helpers for git and gh, git worktree detection, branch-name construction, explicit file staging, commit, push, base-branch detection, and noninteractive gh environment handling.
  - Acceptance: Helpers never use shell string interpolation; gh runs with prompt/notifier env disabled; base branch resolves by config, `origin/HEAD`, then `main`.
  - Verification: Run focused Bun tests with temporary git repos and a stubbed `gh` executable that assert argv/env and fallback behavior.

## Wave 2: Branching and checkpoint lifecycle

- [x] T003: Branch and commit new changes
  - Files: `src/core/commands.ts`, `src/core/git.ts`, `test/core-new.test.ts`, `test/core-commands.test.ts`
  - Action: Wire `new` to create/switch `kind/id-slug` branches in git worktrees and auto-commit only the scaffold/state files it touched when `workflow.autoCommit` is true.
  - Acceptance: Non-git projects keep existing scaffold behavior; git projects create the expected branch and a scaffold commit without staging unrelated files.
  - Verification: Run focused `new` command tests for non-git tempdirs, git tempdirs, auto-commit disabled, and unrelated unstaged file preservation.

- [x] T004: Add checkpoint command prompts
  - Files: `src/core/commands.ts`, `src/core/prompts.ts`, `test/core-commands.test.ts`, `test/core-prompts.test.ts`
  - Action: Add `commit` and `checkpoint` command dispatch, flags, help text, explicit `--files` validation, mutually exclusive `--phase`/`--task` selectors, deterministic commit messages, and lifecycle prompt checkpoint instructions.
  - Acceptance: Agents receive concrete checkpoint commands in generated prompts; checkpoint commits stage exactly the supplied files and reject missing files, empty file lists, or ambiguous unit selectors.
  - Verification: Run focused command and prompt tests for parser errors, alias behavior, file scoping, deterministic messages, and checkpoint text in lifecycle prompts.

## Wave 3: Publishing

- [x] T005: Generate rich PR bodies
  - Files: `src/core/commands.ts`, `src/core/git.ts`, `test/core-commands.test.ts`
  - Action: Generate PR body markdown from Specwright artifacts using Summary, Changes, Verification, Key Decisions, Evidence/Sources, and Handoff/Next Steps sections, omitting empty sections.
  - Acceptance: PR bodies contain artifact-derived content rather than placeholders and remain useful when some optional artifacts are empty or missing.
  - Verification: Run focused PR body tests against populated and sparse change artifacts and assert the generated body file content.

- [x] T006: Implement publish modes
  - Files: `src/core/commands.ts`, `src/core/git.ts`, `test/core-commands.test.ts`
  - Action: Add `publish [--mode none|push|pr]`, config fallback, push behavior, PR creation flow, explicit base/head flags, use of the generated PR body file, and command help output.
  - Acceptance: `none` performs no remote work; `push` pushes the current branch to the configured remote; `pr` pushes then invokes `gh pr create --title --body-file --base --head` noninteractively.
  - Verification: Run focused publish tests with temporary git remotes and stubbed `gh` asserting mode selection, argv, env, body-file usage, and failure messages when auth/gh execution fails.