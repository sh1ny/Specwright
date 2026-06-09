# Sources

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## URLs

- None. `online=auto`; local repository evidence fully determines this change, so no web search was needed.

## Local references

- `.specwright/changes/0006-state-safeguards/intent.md:16-18` — approved ownership model and non-goal.
- `.specwright/changes/0006-state-safeguards/constraints.md:13-21` — task authority, safe sync, command surfaces, OMP status, passive sync, validator, and checkpoint constraints.
- `src/core/commands.ts:404-414` — status reads cached state only.
- `src/core/commands.ts:629-648` — command-local task parsing and persistence.
- `src/core/commands.ts:677-711` — checkpoint parses tasks before phase/task validation and stages only explicit files.
- `src/core/commands.ts:714-800` — tasks, execute, verify, and handoff consume or mutate task state inconsistently.
- `src/core/state.ts:82-127` — state load/save/find/upsert helpers; `upsertChange()` mutates `currentChange`.
- `src/core/validators.ts:101-199` — current task block validation and issue codes.
- `src/runtime/omp/status.ts:1-18` — OMP status reads raw cached state.
- `src/runtime/omp/extension.ts:34-37` — OMP status refresh hooks.
- `test/core-commands.test.ts:235-282` — checkpoint tests cover selector/staging basics but not derived-state side effects.
- `test/core-validators.test.ts:9-22` — duplicate task ID validation coverage.
- `test/omp-extension.test.ts:16-40` — basic OMP command/status coverage.
