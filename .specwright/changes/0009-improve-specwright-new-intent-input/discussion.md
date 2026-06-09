# Discussion

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Conversation notes

- Local evidence: `intent.md:5-19` freezes the change goal around request-based `specwright new` input, longer inline text, `@file`, request-derived titles, and removing explicit title input.
- Local evidence: `src/core/commands.ts:504-520` currently parses `[kind, title]`, requires a title, and derives the slug directly from that title.
- Local evidence: `src/core/commands.ts:544-553` scaffolds artifacts from template replacements only; there is no source-request field.
- Local evidence: `src/core/commands.ts:1064-1065` and `test/core-new.test.ts:37-91` still encode the title-based usage and title-derived directory/branch behavior.

## Open questions

- None after the structured clarification on 2026-06-09.

## Settled decisions

### Checkpoint 1 — Input contract

- Question: Which `specwright new` input forms should be in scope?
- Settled answer: Support trailing implementation-request input plus local `@file` references.
- Evidence: Current parser only consumes `args.positionals` as `[kindArg, title]` (`src/core/commands.ts:504-505`), so the plan must replace the title positional with request collection.

### Checkpoint 2 — Title generation

- Question: How should request-derived titles work when deterministic CLI execution is offline?
- Settled answer: Use a deterministic local fallback first; keep the design open to later model refinement, but do not require model availability for this change.
- Evidence: Current slug/title are synchronous and deterministic (`src/core/commands.ts:516-520`), and current tests assert deterministic slugs/branches (`test/core-new.test.ts:42-47`, `:72-79`).

### Checkpoint 3 — `@file` boundaries

- Question: What are the `@file` reference boundaries?
- Settled answer: Local files only, resolved from the working directory; reject missing paths and directories; enforce a bounded file-size limit; do not add globs, URLs, or stdin in this change.
- Evidence: The current command performs no file-reference expansion before template scaffolding (`src/core/commands.ts:544-553`), so file handling must be explicit and bounded.

### Checkpoint 4 — Artifact population

- Question: How should the source request be written into artifacts?
- Settled answer: Preserve the raw assembled source request in `intent.md`; keep generated title/slug in state and derived paths.
- Evidence: Current templates receive only `id`, `title`, `kind`, `mode`, `pack`, and `createdAt` replacements (`src/core/commands.ts:476-484`, `:544-550`), so the plan must add a source-request artifact path without treating it as the explicit title.