# Decisions

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Settled

- Safe task drift is auto-synchronized from `tasks.md` into `state.json`; validation reports only unreconciled drift that cannot be safely synced.
- OMP session status refresh uses a shared core sync/status path and may update derived state so the badge matches slash-command status.
- Sync preserves cached `in-progress` and `blocked` for unchecked tasks when ID/title still match; checked tasks become `done`.
- Change 0006 scope is the minimum state-safeguards slice: parser/sync helper, non-current-mutating state update path, command wiring, validator issue, OMP status refresh, and tests.
- Checkpoint handling is in scope: commands that mutate derived `.specwright/state.json` during checkpoint must either avoid that mutation or stage it automatically.

## Deferred

- New task-management CLI commands such as `specwright task add` and `specwright task sync`.
- Any broader model-authored `state.json` write contract.

## Ready state

Ready for research once the discuss checkpoint records these artifacts.
