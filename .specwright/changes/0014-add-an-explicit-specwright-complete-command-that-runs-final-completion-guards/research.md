# Research

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local findings

### Merge proposal

`localdocs/MERGE-PROPOSAL.md` is directly aligned with the current request. It proposes `specwright complete [<change>] [--mode merge|push|pr|none]`, keeps merge behavior out of `verify`, `handoff`, and `checkpoint`, and states that `publish` should remain push/PR-focused remote publication (`localdocs/MERGE-PROPOSAL.md:21-33`). It defines mode behavior for `none`, `push`, `pr`, and `merge` (`localdocs/MERGE-PROPOSAL.md:52-86`) and lists fail-before-side-effect guardrails covering git state, validation, tasks, observed verification, required artifacts, branch/change mismatch, base resolution, and merge conflicts (`localdocs/MERGE-PROPOSAL.md:88-105`).

The proposal recommends using a no-fast-forward merge commit for local merge mode so the Specwright change boundary remains visible in git history (`localdocs/MERGE-PROPOSAL.md:80-86`). It also recommends no branch deletion by default (`localdocs/MERGE-PROPOSAL.md:139-142`, `localdocs/MERGE-PROPOSAL.md:174-180`).

### Existing command seams

`src/core/commands.ts` already splits `--mode` parsing by command: `publish` uses `WorkflowPublishMode`, while non-publish commands use `SpecwrightMode` (`src/core/commands.ts:126-138`). `complete` therefore needs its own parsed field and enum rather than reusing `mode` or widening `WorkflowPublishMode` with `merge`.

`commandPublish` is remote-only today: `none` returns with no remote work, `push` calls `pushBranch`, and `pr` pushes then calls `createPullRequest` (`src/core/commands.ts:1093-1121`). Keeping merge out of publish preserves that contract.

`runSpecwrightCommand` dispatch currently has no `complete` case and help text has no `complete` usage (`src/core/commands.ts:1151-1185`). Adding the command requires parser, dispatch, and help updates.

### Existing guards and validation

`commandVerify` runs `validateChange`, writes `verify.md`, and advances the lifecycle to `verifying` only when validation passes (`src/core/commands.ts:956-1001`). `commandHandoff` syncs tasks, writes `handoff.md`, and marks the change `done` only when validation passes and all cached tasks are done (`src/core/commands.ts:1004-1022`).

`validateChange` already checks intent content, required evidence after planning, duplicate task ids, missing tasks before execute, task acceptance/verification blocks, task drift, and observed output evidence once all tasks are checked (`src/core/validators.ts:150-220`). `complete` still needs stricter final guards because the request requires missing final artifacts and incomplete tasks to fail before side effects.

### Existing git seams

`src/core/git.ts` has reusable primitives for git worktree detection, branch name derivation, current branch detection, pushing, PR creation, and base branch resolution (`src/core/git.ts:79-188`). It does not yet have dedicated helpers for clean-worktree checks, switching to an existing base branch without creating it, pulling a base branch, or merging with `--no-ff`.

`currentBranch` already treats an empty `git branch --show-current` result as detached HEAD (`src/core/git.ts:136-143`). `branchNameForChange` is the existing source of truth for matching a change to its truncated feature branch (`src/core/git.ts:91-103`).

### Test seams

`test/core-commands.test.ts` already uses real temporary git repositories and bare remotes for publish behavior (`test/core-commands.test.ts:35-41`, `test/core-commands.test.ts:1257-1272`). PR behavior is tested with a stub `gh` binary and captured argv/env (`test/core-commands.test.ts:1274-1350`). `complete` tests can reuse these patterns for `push` and `pr`, and add real-repo merge/conflict cases without mocking git.

## External findings

No external research was needed. The requested behavior is constrained by local Specwright source, tests, and `localdocs/MERGE-PROPOSAL.md`.

## Implications

- Add a separate `WorkflowCompleteMode` / `COMPLETE_MODES` path rather than widening `WorkflowPublishMode`; this keeps `publish` remote-only.
- Implement complete as a fail-closed command with guard evaluation before push, PR, branch switch, pull, merge, or state mutation.
- Prefer focused git helpers in `src/core/git.ts` for clean status, existing-branch switch, optional pull, and no-fast-forward merge.
- Reuse `validateChange`, task sync/parsing, `branchNameForChange`, `resolveBaseBranch`, `pushBranch`, `createPullRequest`, and PR body generation where possible.
- Tests should assert no side effects after failing guards, especially dirty worktree and base-branch cases.
