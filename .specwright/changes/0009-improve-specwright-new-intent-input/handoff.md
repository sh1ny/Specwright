# Agent Handoff: 0009

## Goal

# Intent

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">
## Goal

Make `specwright new` accept an implementation request as the source intent instead of requiring a short human-authored title. The command must support longer inline text, `@file` references, model-generated change titles derived from the request, and remove the current explicit title input contract.

## Users

- Maintainers and agents creating Specwright changes from natural-language task descriptions.
- OMP users invoking `/specwright new` with enough context for the lifecycle to start without manual artifact editing.

## Non-goals

- Do not change downstream lifecycle commands (`discuss`, `research`, `plan`, `tasks`, `execute`) except where their usage/help text needs to reflect the new `new` contract.

</frozen-after-approval>

## Approval notes

### Source request

Make `specwright new` accept an implementation request as the source intent instead of requiring a short human-authored title. The command must support longer inline text, `@file` references, request-derived change titles, and remove the current explicit title input contract.

### Settled interpretation

- Input contract: `specwright new <kind> <request...>` with local `@file` expansion.
- Title behavior: derive title/slug deterministically from the request in this change; leave a seam for later model refinement, but do not require model availability.
- Artifact behavior: preserve the raw assembled request in `intent.md` for discuss/research evidence.

## Read first

- .specwright/changes/0009-improve-specwright-new-intent-input/intent.md
- .specwright/changes/0009-improve-specwright-new-intent-input/evidence.md
- .specwright/changes/0009-improve-specwright-new-intent-input/tasks.md
- .specwright/changes/0009-improve-specwright-new-intent-input/verify.md

## Current state

status=done; step=handoff

## Constraints

See intent.md and evidence.md.

## Acceptance

# Verification

## Result

PASS

## Issues

No issues.

## Observed output

```
$ bun test test/core-commands.test.ts test/core-prompts.test.ts test/core-new.test.ts test/omp-extension.test.ts
Test Results:
   PASS: 74 passed
```


## Next task

No incomplete tasks.

## Evidence

# Evidence

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local evidence

- `src/core/commands.ts:107-178`: `parseArgs` pushes every non-option token into `positionals`; `request...` support is available at parse time.
- `src/core/commands.ts:504-511`: `commandNew` destructures only `[kindArg, title]`, validates kind, and reports title-based usage when missing.
- `src/core/commands.ts:519-536`: state uses `title` and `slugify(title)`; branch name is computed from the same change object before artifacts are written.
- `src/core/commands.ts:544-552`: template rendering only replaces values from `templateValues`; raw source request is not available to templates.
- `src/core/commands.ts:561-564`: auto-commit stages generated scaffold files plus `.specwright/state.json`, matching the constraint to preserve scoped git behavior.
- `src/core/commands.ts:1064-1067`: CLI help advertises title input instead of request input.
- `packs/core/templates/intent.md:1-16`: intent template has empty goal/users/non-goals and approval notes; no exact source request field exists.
- `test/core-new.test.ts:37-111`: existing tests assert `Inventory Crafting` creates `0001-inventory-crafting`, sets current change, creates branch `feature/0001-inventory-crafting`, and commits only scaffold/state files when auto-commit is enabled.
- `src/runtime/omp/args.ts:1-35`: OMP argument splitting preserves quoted strings and emits unquoted trailing words as separate tokens.

## Research attempts

- Parent spawned `specwright-researcher` with the full prompt and waited for completion before editing artifacts.
- The researcher completed and returned exact artifact content, but did not edit files because edit/write/bash tools were unavailable in that subagent context.
- No lightweight scout failed, so no retry with the bundled `task` agent was triggered.
- No checkpoint, status update, checklist update, or project-wide command was run before artifact verification.

## Decisions supported

- Treat all tokens after `<kind>` as one source request, not as a title plus ignored extras.
- Add a request assembly/expansion seam so validation, title derivation, and intent rendering share one assembled string.
- Keep deterministic slug/branch behavior by deriving `title` from the assembled request locally and continuing to use `slugify`/`branchNameForChange`.
- Update CLI help, missing-input errors, focused tests, and OMP-facing expectations together.
