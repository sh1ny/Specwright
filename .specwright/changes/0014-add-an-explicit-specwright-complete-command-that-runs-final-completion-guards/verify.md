# Verification

## Result

PASS

## Issues

No issues.

## Observed output

### T001 — Command parsing

```
$ bun test test/core-commands.test.ts -t "complete"
Test Results:
   PASS: 5 passed
```

- `complete [<change>] [--mode none|push|pr|merge]` parses correctly; invalid modes rejected.
- Help text lists complete usage: `specwright complete [<change>] [--mode none|push|pr|merge]`.
- `publish --mode merge` still rejected (publish modes unchanged: `none|push|pr`).

### T002 — Git helpers

- `isWorktreeClean`, `switchToExistingBranch`, `mergeNoFastForward` present in `src/core/git.ts`.
- Tests confirm: clean/dirty detection, branch switch, no-fast-forward merge, missing-branch failure.

### T003 — Preflight guards

- Guard tests pass: not-in-worktree, detached HEAD, no current change, branch/change mismatch, on-base-branch, dirty worktree all fail before side effects.
- Guard ordering test confirms guards run before push/pr/merge.

### T004 — Lifecycle and evidence guards

- Validation failure, incomplete tasks, missing `verify.md`, missing `handoff.md` all fail before mode side effects.
- `validateChange` reused from `src/core/validators.ts`.

### T005 — Mode side effects

- `complete none`: no side effects, status set to done.
- `complete push`: pushes current branch to remote.
- `complete merge`: switches to base, creates no-fast-forward merge commit.
- Default mode is `none` when omitted.

### T006 — Documentation and regression

```
$ bun test test/core-commands.test.ts
Test Results:
   PASS: 97 passed
```

- README documents complete usage, default mode, guard expectations, mode side effects.
- Publish behavior remains `none|push|pr` only — no regression.

## Files changed

- `src/core/types.ts` — `WorkflowCompleteMode` type
- `src/core/commands.ts` — `commandComplete`, `COMPLETE_MODES`, parsing, help
- `src/core/git.ts` — `isWorktreeClean`, `switchToExistingBranch`, `mergeNoFastForward`
- `src/core/validators.ts` — `validateChange` reuse for complete guards
- `test/core-commands.test.ts` — complete command test coverage
- `README.md` — complete command documentation
