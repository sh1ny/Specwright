# Tasks

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Wave 1: Shared state foundation

- [x] T001: Extract task parsing and safe sync
  - Files: `src/core/commands.ts`, `src/core/state.ts`, `src/core/types.ts`, `test/core-commands.test.ts`
  - Action: Move checklist parsing out of command-local code into shared core helpers that reconcile `tasks.md` against cached task state. Preserve `in-progress` and `blocked` for unchecked tasks when ID and title still match; mark checked tasks as `done`; expose unsafe drift diagnostics instead of silently overwriting ambiguous state.
  - Acceptance: CLI code has one shared task artifact parser/sync path; title drift, checkbox drift, preserved runtime statuses, malformed task lines, and duplicate IDs have deterministic outcomes.
  - Verification: Run the focused Bun tests that cover task parsing/sync behavior and confirm they fail before the helper behavior exists and pass after implementation.

- [x] T002: Add passive change state updates
  - Files: `src/core/state.ts`, `src/core/commands.ts`, `test/core-commands.test.ts`
  - Action: Add a state write helper that updates one cached change without changing `currentChange`. Keep `upsertChange()` for flows that intentionally make a change current, and migrate passive sync call sites to the new helper.
  - Acceptance: Syncing a non-active change updates that change's cached task metadata without changing `.specwright/state.json.currentChange`.
  - Verification: Run a focused command/state test that creates two changes, syncs the non-current one, and asserts the previous `currentChange` remains unchanged.

## Wave 2: CLI behavior and checkpoint safety

- [x] T003: Auto-sync state-dependent CLI commands
  - Files: `src/core/commands.ts`, `src/core/state.ts`, `test/core-commands.test.ts`
  - Action: Run safe sync before `status`, `tasks`, `execute`, `verify`, and `handoff` read task state. Ensure checked boxes in `tasks.md` become cached `done` state and safe unchecked tasks remain pending or preserve runtime-only status.
  - Acceptance: User-facing command output reflects artifact truth after `tasks.md` changes, without requiring agents or users to edit `.specwright/state.json` manually.
  - Verification: Run focused CLI tests for `status`, `execute`, `verify`, and `handoff` after changing `tasks.md` directly; assert observed output/state uses synced task metadata.

- [x] T004: Fix checkpoint derived-state side effects
  - Files: `src/core/commands.ts`, `src/core/git.ts`, `test/core-commands.test.ts`
  - Action: Reorder checkpoint logic so `--phase` checkpoints do not parse tasks or write `.specwright/state.json`. For `--task`, sync only as needed to validate the task and automatically stage `.specwright/state.json` when that sync mutates derived state.
  - Acceptance: `checkpoint --phase plan --files plan.md,tasks.md` commits only listed phase files when task metadata is not needed; `checkpoint --task T###` includes derived state in the same commit when sync changes it.
  - Verification: Run focused checkpoint tests for phase no-write/no-stage behavior and task checkpoint derived-state staging behavior.

## Wave 3: OMP and validation surfaces

- [x] T005: Refresh OMP status through shared sync
  - Files: `src/runtime/omp/status.ts`, `src/runtime/omp/extension.ts`, `test/omp-extension.test.ts`
  - Action: Update OMP badge/status refresh to use the shared core sync/status path instead of reading raw cached state directly.
  - Acceptance: OMP-visible status reflects `tasks.md` changes after session refresh and does not display stale cached task state.
  - Verification: Run the OMP extension/status tests with a fixture where `tasks.md` and cached state disagree; assert the displayed status uses synced state.

- [ ] T006: Report unreconciled task drift
  - Files: `src/core/validators.ts`, `src/core/state.ts`, `test/core-validators.test.ts`
  - Action: Extend validation to compare task artifacts against cached state and emit a specific issue code for drift that safe sync cannot reconcile, including malformed checklist state, duplicate task IDs, missing task artifacts at execute-or-later phases, or cached tasks for missing artifacts.
  - Acceptance: `verify` reports actionable drift issues instead of silently accepting stale or ambiguous task cache state.
  - Verification: Run focused validator tests that assert the new issue code for unreconciled drift and no issue for safe drift that sync can reconcile.
