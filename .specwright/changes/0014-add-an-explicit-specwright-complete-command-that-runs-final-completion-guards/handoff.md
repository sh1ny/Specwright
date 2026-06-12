# Handoff

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Goal

Deliver an explicit `specwright complete` command that runs final completion guards before performing any finishing side effect (push, PR creation, or merge).

## Read first

- `src/core/commands.ts` — `commandComplete` implementation and guard ordering.
- `src/core/validators.ts` — `hasObservedOutput` helper reused by completion and validation.
- `src/core/git.ts` — git helpers used by completion (`isWorktreeClean`, `switchToExistingBranch`, `mergeNoFastForward`, `pushBranch`, `createPullRequest`).
- `src/runtime/omp/status.ts` — OMP `/specwright` argument completions.
- `test/core-commands.test.ts` — new and updated completion tests.
- `test/omp-extension.test.ts` — OMP completion coverage.
- `README.md` — user-facing complete documentation.

## Current state

All review-fix items implemented:

1. `complete` added to OMP argument completions and tested.
2. `commandComplete` fails on task-sync drift before using the synced change.
3. Taskless/fresh changes cannot complete; at least one parseable task and all tasks done are required.
4. `verify.md` must contain observed command/output evidence, not just arbitrary prose.
5. `complete --mode pr` is covered end-to-end with a fake `gh` runner.
6. Detached HEAD failure message is explicit and tested after a valid change exists.
7. Later-guard failures prevent push/PR/merge side effects; tests assert remote, branch, HEAD, and state remain unchanged.
8. Merge success test asserts the merge commit has two parents.
9. README and 0014 artifacts corrected: merge conflicts are discovered during merge, not pre-side-effect guards.
10. This `handoff.md` populated with concrete context.
11. `decisions.md` updated: default mode `none`, PR behavior delegated to `gh pr create`, no automatic base update, final artifact policy settled.

## Constraints

- No checkpoint, commit, or lifecycle status update was made.
- No broad refactor outside the affected code paths.
- Existing conventions (argv arrays, `fail`-first guards, `gh pr create` noninteractive env, test temp-dir patterns) were preserved.

## Acceptance

- `bun test test/core-commands.test.ts -t "complete"` passes.
- `bun test test/omp-extension.test.ts -t "OMP argument completions include complete"` passes.
- `bun run typecheck` passes.
- README and 0014 lifecycle artifacts accurately describe implemented behavior.

## Next task

None for this change. Ready for Main to run final verification and merge.
