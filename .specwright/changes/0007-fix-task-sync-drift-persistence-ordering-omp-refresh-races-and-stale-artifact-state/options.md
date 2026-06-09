# Options

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Option 1: Direct command-level fixes

Change `updateChangeStep` to use `updateCachedChange` instead of `upsertChange`. Then add `syncChangeTasksForCommand` calls to `commandDiscuss`, `commandResearch`, and `commandPlan`. Update `commandExecute` and `commandHandoff` to use `updateCachedChange` directly. Modify `commandCheckpoint` to always include `state.json` in `filesToStage` when `tasks.md` is in `--files`.

Pros: Minimal diff, leverages existing helpers, preserves all current test structure.
Cons: Requires touching multiple commands; future commands could still accidentally use `upsertChange` and reintroduce the bug.

## Option 2: Introduce explicit persist helper with a switch-current flag

Add `persistChange(cwd, change, { switchCurrent: boolean })` to `state.ts`. Replace all direct `upsertChange` and `updateCachedChange` calls with `persistChange(..., { switchCurrent: true/false })`. This makes the intent explicit at every call site.

Pros: Prevents accidental misuse by making the choice mandatory; centralizes persistence logic.
Cons: Larger refactor touching more lines; `updateCachedChange` and `upsertChange` already exist and are well-tested; merging them into one helper adds indirection without much functional gain.

## Recommendation

**Option 1.** The existing helpers (`updateCachedChange`, `upsertChange`) already encode the two behaviors correctly. The bug is in the command-level call sites, not in the helpers themselves. Option 1 is a surgical fix with a smaller blast radius and clearer test coverage.
