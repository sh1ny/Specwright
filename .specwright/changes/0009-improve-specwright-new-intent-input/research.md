# Research

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local findings

- `parseArgs` already keeps every non-option token in `positionals`; `specwright new` can receive multi-token requests mechanically, but `commandNew` currently destructures only `[kindArg, title]` and ignores later tokens. See `src/core/commands.ts:107-178` and `src/core/commands.ts:504-511`.
- The explicit title contract is still user-facing: missing input returns `Usage: specwright new <kind> "<title>"`, and help prints the same title-based form. See `src/core/commands.ts:509-510` and `src/core/commands.ts:1064-1067`.
- Current title/slug/branch behavior is deterministic: `commandNew` stores `title`, computes `slugify(title)`, and git branch names use `<kind>/<id>-<slug>`. See `src/core/commands.ts:519-536`, `src/core/slug.ts:1-14`, and `src/core/git.ts:82-84`.
- Generated artifacts are rendered from `templateValues(change)`, which exposes only id/title/kind/mode/pack/createdAt; `intent.md` has no raw request slot. See `src/core/commands.ts:476-484`, `src/core/commands.ts:544-552`, and `packs/core/templates/intent.md:1-16`.
- Focused tests already cover `new` directory naming, current-change state, git branch creation, scoped auto-commit, and disabled auto-commit. See `test/core-new.test.ts:37-111`.
- OMP invokes the same command through `splitArgs(args)`, so quoted requests and unquoted trailing words flow into the same parser. See `src/runtime/omp/args.ts:1-35`.

## External findings

No external search was necessary. This is local CLI/OMP input handling plus filesystem validation using APIs already present in the repository; no dependency, web API, standard, or recent external behavior materially affects planning.

## Implications

- Change `commandNew` to assemble `<request...>` from all trailing positionals after `<kind>` and reject an empty assembled request.
- Expand local `@file` references before title derivation and artifact rendering, with fixed size limits and actionable errors for missing paths, directories, globs, URLs, stdin markers, and unreadable files.
- Preserve the raw assembled request in generated `intent.md`; keep deterministic local title/slug derivation for this change.
- Preserve git behavior by keeping `ChangeState`, branch naming, and scoped auto-commit flow intact.