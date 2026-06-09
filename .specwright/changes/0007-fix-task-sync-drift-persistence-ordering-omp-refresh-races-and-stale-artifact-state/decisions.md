# Decisions

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Settled

1. **Separate `upsertChange` from active-change switching** — Introduce `updateCachedChange` as the non-switching write path. `upsertChange` keeps its current behavior (sets current) for `new`, but all other commands migrate to `updateCachedChange`.
2. **Universal auto-resync on read-path commands** — `commandStatus`, `commandDiscuss`, `commandResearch`, `commandPlan`, `commandExecute`, `commandVerify`, and `commandHandoff` all call `syncChangeTasksForCommand()` before using `change.tasks`.
3. **Conservative checkpoint staging** — `commandCheckpoint` checks if `tasks.md` is in `--files`; if so, it unconditionally includes `state.json` in `filesToStage`.
4. **Accurate OMP refresh** — `refreshStatus` continues calling the full `status` command. Since `status` will now auto-resync, the status bar reflects current task progress without extra code in the OMP layer.

## Deferred

- Debouncing or throttling `refreshStatus` if I/O cost becomes observable in practice.
- Explicit `specwright sync` command (can be added later if needed).

## Ready state

Ready for research.
