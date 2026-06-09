# Tasks

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Wave 1 — Core sync correctness

- [x] T001: Report cached tasks missing from artifact as sync issues
  - Files: `src/core/state.ts`
  - Action: When `syncChangeTasksFromMarkdown` builds the new task map, emit a `cached-task-without-artifact` issue for every task ID present in `change.tasks` that is absent from the parsed `tasks.md`. Add these issues to the returned `issues` array before returning the sync result. Currently cached `in-progress` or `blocked` tasks are silently deleted.
  - Acceptance: Sync result contains an issue when a cached task ID is missing from the artifact.
  - Verification: Run `bun test` and confirm the new test `syncChangeTasksFromMarkdown emits cached-task-without-artifact issues` passes.

- [x] T002: Gate task sync persistence on clean sync results
  - Files: `src/core/state.ts`
  - Action: `syncChangeTasksFromFileIfPresent` must not call `updateCachedChange` when `syncChangeTasksFromMarkdown` returns issues (e.g., `title-drift`, `duplicate-task-id`, `malformed-task-line`, `cached-task-without-artifact`). Return the sync result unchanged and let callers decide how to handle dirty syncs. State-dependent commands currently overwrite drift before validation can detect it.
  - Acceptance: State is only written when sync produces zero issues; callers handle non-clean results appropriately.
  - Verification: Run `bun test` and confirm `syncChangeTasksFromFileIfPresent` does not call `updateCachedChange` when `syncChangeTasksFromMarkdown` returns issues.

## Wave 2 — State write safety

- [x] T005: Serialize concurrent OMP status refreshes
  - Files: `src/runtime/omp/status.ts`
  - Action: Two overlapping `refreshStatus` calls both write `.specwright/state.json` via the same temp path (`state.json.tmp-${process.pid}`). One rename can remove the other's temp file and cause an unhandled ENOENT. Guard in-flight refreshes with a promise chain so overlapping calls await the same in-flight refresh instead of spawning a second concurrent write.
  - Acceptance: Concurrent OMP refreshes do not race on state writes or clear the badge spuriously.
  - Verification: Run `bun test` and confirm concurrent `refreshStatus` calls do not throw ENOENT on temp file rename.

- [x] T008: Separate upsertChange from active-change switching
  - Files: `src/core/state.ts`, `src/core/commands.ts`
  - Action: Change `upsertChange` so it no longer sets `state.currentChange`. Update `updateChangeStep` to call `updateCachedChange` instead of `upsertChange`. Update `commandExecute` and `commandHandoff` to call `updateCachedChange` after mutating tasks. Only `commandNew` may explicitly set `currentChange`.
  - Acceptance: `discuss`, `research`, `plan`, `execute`, `verify`, and `handoff` on an explicit non-current change do not modify `currentChange`.
  - Verification: Run `bun test` and confirm the new tests for each command pass.

## Wave 3 — Command consistency

- [x] T009: Auto-resync tasks.md in discuss, research, and plan commands
  - Files: `src/core/commands.ts`
  - Action: Add `syncChangeTasksForCommand` to `commandDiscuss`, `commandResearch`, and `commandPlan` before proceeding, matching the pattern used by `commandStatus`, `commandExecute`, `commandVerify`, and `commandHandoff`. `syncChangeTasksFromFileIfPresent` safely no-ops when `tasks.md` is missing, so this is safe for pre-task phases.
  - Acceptance: These commands resync tasks when `tasks.md` exists and safely no-op when it does not.
  - Verification: Run `bun test` and confirm the new tests `discuss resyncs tasks`, `research resyncs tasks`, and `plan resyncs tasks` pass.

- [x] T010: Always stage state.json when tasks.md is in checkpoint files
  - Files: `src/core/commands.ts`
  - Action: In `commandCheckpoint`, if `tasks.md` is in `--files`, always include `.specwright/state.json` in `filesToStage`. For `--task`, still perform sync but ensure `state.json` is staged regardless of `syncResult.changed`. For `--phase`, simply include `state.json` when `tasks.md` is present in `--files`. Currently metadata-only edits to task bullets do not trigger `syncResult.changed`, leaving `state.json` dirty.
  - Acceptance: Checkpoint `--phase` and `--task` both stage `state.json` when `tasks.md` is in `--files`, even for metadata-only edits.
  - Verification: Run `bun test` and confirm the new tests for metadata-only checkpoint staging pass.

- [x] T003: Prevent verify from persisting drift before validation
  - Files: `src/core/commands.ts`
  - Action: `commandVerify` syncs and persists `tasks.md` into cached state before calling `validateChange`. This erases the exact drift SW009 is meant to detect. Reorder so `validateChange` runs against the original cached state (before sync) or reject unreconciled sync results before persisting. If sync issues exist, surface them in the validation report.
  - Acceptance: `specwright verify` reports SW009 for title drift and cached-only tasks even when `tasks.md` disagrees with `state.json`.
  - Verification: Run `bun test` and confirm `verify` command test reports SW009 for title drift even when `tasks.md` was edited.

- [x] T004: Handle task sync issues before checkpoint staging
  - Files: `src/core/commands.ts`
  - Action: The `--task` checkpoint path uses `syncResult.change`/`changed` without checking `syncResult.issues`. A checkpoint can commit a rewritten cache that erases drift signals. Fail the checkpoint or surface sync issues before staging derived state.
  - Acceptance: Task checkpoint fails or reports issues when sync detects drift, duplicate IDs, or malformed lines.
  - Verification: Run `bun test` and confirm checkpoint `--task` fails when sync detects duplicate task IDs or malformed lines.

## Wave 4 — Artifact cleanup

- [x] T006: Refresh state.json to match completed T006 artifacts
  - Files: `.specwright/state.json`
  - Action: Change 0006's T006 is marked checked in `tasks.md` and `verify.md` records PASS, but `state.json` still shows T006 as `pending` and the change as `executing`. Run `specwright status 0006` (or `specwright tasks 0006`) to sync derived state to artifact truth.
  - Acceptance: `state.json` reflects T006 status as `done` and change status as `verifying` or later.
  - Verification: Inspect `.specwright/state.json` to confirm T006 status is `done` and change 0006 status is `verifying` or later.

- [x] T007: Correct verify.md test count and refresh evidence.md
  - Files: `.specwright/changes/0006-state-safeguards/verify.md`, `.specwright/changes/0006-state-safeguards/evidence.md`
  - Action: Recorded test count claims 36 but the three referenced files contain 38 test cases. `evidence.md` references pre-implementation code paths as current. Update both to match the actual branch state.
  - Acceptance: `verify.md` has correct test count; `evidence.md` references post-implementation source paths.
  - Verification: Run `bun test` and confirm the total test count matches `verify.md`; inspect `evidence.md` to confirm it cites current source paths.
