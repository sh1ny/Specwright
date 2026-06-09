# Sources

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## URLs

None. This change is mechanically constrained by local code.

## Local references

- `src/core/state.ts:320-333` — `updateCachedChange` and `upsertChange` definitions
- `src/core/commands.ts:552-556` — `updateChangeStep` (uses `upsertChange`)
- `src/core/commands.ts:577-585` — `commandDiscuss` (no task resync)
- `src/core/commands.ts:587-621` — `commandResearch` (no task resync)
- `src/core/commands.ts:623-661` — `commandPlan` (no task resync)
- `src/core/commands.ts:690-736` — `commandCheckpoint` (conditional state.json staging)
- `src/core/commands.ts:771-786` — `commandExecute` (uses `upsertChange`)
- `src/core/commands.ts:788-802` — `commandVerify` (uses `updateChangeStep` → `upsertChange`)
- `src/core/commands.ts:804-823` — `commandHandoff` (uses `upsertChange`)
- `src/runtime/omp/status.ts:4-16` — `refreshStatus` calls full `status` command
- `test/core-commands.test.ts:285-304` — phase checkpoint does not sync task metadata
- `test/core-commands.test.ts:306-322` — task checkpoint stages derived state when sync changes cache
- `test/core-commands.test.ts:445-466` — passive sync of non-current change preserves currentChange
- `test/core-commands.test.ts:498-555` — status/execute/verify/handoff sync behavior
