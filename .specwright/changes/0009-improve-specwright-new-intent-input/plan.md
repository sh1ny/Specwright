# Plan

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Summary

Change `specwright new` from title-based scaffolding to request-based scaffolding: `specwright new <kind> <request...>`. Parsing already preserves all non-option tokens, but `commandNew` currently consumes only `<kind>` and one title token, so the implementation is a local command/template/test change rather than a parser rewrite. Evidence: `.specwright/changes/0009-improve-specwright-new-intent-input/evidence.md` local evidence for `src/core/commands.ts:107-178` and `src/core/commands.ts:504-511`.

## Decisions

1. **Input contract.** Keep `<kind>` as the first positional and assemble every remaining positional into one source request with single-space joins. Reject an empty assembled request with `Usage: specwright new <kind> <request...>`. Update help and OMP-facing text so no user path advertises `"<title>"`. Evidence: `.specwright/changes/0009-improve-specwright-new-intent-input/evidence.md` entries for `src/core/commands.ts:504-511`, `src/core/commands.ts:1064-1067`, and `src/runtime/omp/args.ts:1-35`.
2. **Local `@file` references.** Treat standalone request tokens beginning with `@` as local file references. Resolve relative paths from the command working directory; allow absolute paths. Reject URLs, stdin markers, glob patterns, missing paths, directories, unreadable files, and files over a fixed byte limit with actionable errors. Preserve the exact assembled request separately from expanded content. Evidence: `.specwright/changes/0009-improve-specwright-new-intent-input/evidence.md` decisions supported plus constraints in `.specwright/changes/0009-improve-specwright-new-intent-input/constraints.md`.
3. **Title and slug.** Derive `title` deterministically from the expanded request: normalize whitespace, use the first non-empty prose line, trim to a short word-boundary title, preserve original casing, then continue to use existing `slugify(title)` and branch naming. This preserves local/offline behavior while leaving a single title-derivation seam for later model refinement. Evidence: `.specwright/changes/0009-improve-specwright-new-intent-input/evidence.md` entries for `src/core/commands.ts:519-536`, `src/core/slug.ts:1-14`, and `src/core/git.ts:82-84`.
4. **Intent artifact.** Add template values for exact source request and expanded request. Update `packs/core/templates/intent.md` approval notes so later phases can cite the exact user wording and, when `@file` was used, the expanded local content. Evidence: `.specwright/changes/0009-improve-specwright-new-intent-input/evidence.md` entries for `src/core/commands.ts:544-552` and `packs/core/templates/intent.md:1-16`.
5. **Git behavior.** Do not change state shape, branch creation flow, or scoped auto-commit contents beyond the derived title/slug inputs. Evidence: `.specwright/changes/0009-improve-specwright-new-intent-input/evidence.md` entries for `src/core/commands.ts:561-564` and `test/core-new.test.ts:37-111`.

## Dependency waves

- **Wave 1 — Input contract:** assemble `<request...>`, replace usage/help text, and add local `@file` expansion/validation.
- **Wave 2 — Derived scaffold data:** derive title/slug from the expanded request and render source/expanded request into `intent.md`.
- **Wave 3 — Regression coverage:** update focused tests for CLI, prompt/help text, OMP argument expectations, and preserved git/auto-commit behavior.

## Risks

- **Ambiguous `@` text:** only standalone `@path` tokens are expanded; normal prose containing `@` remains text unless tokenized as a file reference.
- **Large or binary files:** bounded byte reads and actionable errors prevent runaway artifact generation.
- **Title drift:** deterministic derivation may produce different slugs from old title input by design; existing branch/autocommit invariants must remain covered by focused tests.

## Verification strategy

Run only focused tests for changed behavior: `bun test test/core-commands.test.ts test/core-prompts.test.ts test/core-new.test.ts test/omp-extension.test.ts` as applicable to edited files.
