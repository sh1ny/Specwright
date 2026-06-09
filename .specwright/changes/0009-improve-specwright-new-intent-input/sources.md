# Sources

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## URLs

None. Online search was unnecessary for this local Specwright CLI/OMP input-contract change; repository code and tests provide the needed API and behavior evidence.

## Local references

- `.specwright/changes/0009-improve-specwright-new-intent-input/intent.md`: approved goal for `specwright new <kind> <request...>`, local `@file` expansion, deterministic request-derived title/slug, and raw request preservation.
- `.specwright/changes/0009-improve-specwright-new-intent-input/constraints.md`: scope and failure-mode constraints for local files, derived naming, and preserved git behavior.
- `src/core/commands.ts:107-178`: CLI parser keeps trailing positionals.
- `src/core/commands.ts:504-569`: `commandNew` currently requires one title, derives slug, renders artifacts, saves state, and handles git branch/auto-commit.
- `src/core/commands.ts:1064-1067`: help still documents `specwright new <kind> "<title>"`.
- `src/core/slug.ts:1-14` and `src/core/git.ts:82-84`: deterministic slug and branch naming helpers.
- `packs/core/templates/intent.md:1-16`: generated intent lacks a raw source-request field.
- `test/core-new.test.ts:37-111`: focused tests for existing `new` behavior and git invariants.
- `src/runtime/omp/args.ts:1-35`: OMP argument splitting preserves quoted strings and emits unquoted trailing words as separate tokens.