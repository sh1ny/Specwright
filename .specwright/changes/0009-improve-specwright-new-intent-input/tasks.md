# Tasks

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Wave 1 — Input contract

- [x] T001: Rework new command intent input
  - Files: `src/core/commands.ts`, `test/core-commands.test.ts`
  - Action: Change `commandNew` to read `<kind>` plus all trailing positionals as one source request, reject empty requests, and replace title-based validation errors with `specwright new <kind> <request...>`.
  - Acceptance: Multi-word unquoted and quoted requests are accepted; later positional tokens are not ignored; missing request errors no longer mention `"<title>"`.
  - Verification: `bun test test/core-commands.test.ts`

- [x] T002: Replace new-command help text
  - Files: `src/core/commands.ts`, `src/core/prompts.ts`, `test/core-commands.test.ts`, `test/core-prompts.test.ts`
  - Action: Update CLI help and prompt/usage strings that describe `specwright new` so they advertise `<request...>` and source intent instead of a manual title.
  - Acceptance: User-visible help, validation, and prompt expectations contain no title-based `specwright new <kind> "<title>"` contract.
  - Verification: `bun test test/core-commands.test.ts test/core-prompts.test.ts`

- [x] T003: Expand local file references
  - Files: `src/core/commands.ts`, `test/core-commands.test.ts`
  - Action: Add request expansion for standalone local `@file` tokens, resolving relative paths from the command working directory and enforcing a fixed maximum file size.
  - Acceptance: Existing files expand into request content; missing files, directories, glob patterns, URLs, stdin markers, unreadable files, and oversized files fail with actionable errors.
  - Verification: `bun test test/core-commands.test.ts`

## Wave 2 — Derived scaffold data

- [x] T004: Derive change title from request
  - Files: `src/core/commands.ts`, `test/core-new.test.ts`, `test/core-commands.test.ts`
  - Action: Derive `title` deterministically from the expanded request, continue computing `slug` via existing slug behavior, and keep branch creation based on the resulting change object.
  - Acceptance: A long request creates a readable request-derived title and slug; state current-change data and branch names use the derived slug; no network/model/stdin dependency is introduced.
  - Verification: `bun test test/core-new.test.ts test/core-commands.test.ts`

- [x] T005: Render source request in intent artifact
  - Files: `src/core/commands.ts`, `packs/core/templates/intent.md`, `test/core-commands.test.ts`
  - Action: Add template values for the exact assembled source request and expanded request, then update `intent.md` approval notes to preserve them.
  - Acceptance: `intent.md` contains the exact user wording for inline requests; `@file` requests also record the expanded content available to later lifecycle phases.
  - Verification: `bun test test/core-commands.test.ts`

## Wave 3 — Regression coverage

- [x] T006: Preserve OMP argument behavior
  - Files: `src/runtime/omp/args.ts`, `test/omp-extension.test.ts`, `test/core-commands.test.ts`
  - Action: Keep OMP argument splitting behavior compatible with quoted requests and unquoted trailing words; update expectations only where usage text changes.
  - Acceptance: OMP invocations pass the same request tokens into `specwright new`; quoted text remains one argument and unquoted trailing words assemble into one request.
  - Verification: `bun test test/omp-extension.test.ts test/core-commands.test.ts`

- [x] T007: Preserve git and scoped commit behavior
  - Files: `src/core/commands.ts`, `test/core-new.test.ts`
  - Action: Update existing new-command git tests to use request input while preserving current-change state, branch creation, and scoped auto-commit assertions.
  - Acceptance: Auto-commit still stages only generated scaffold files plus `.specwright/state.json`; disabled auto-commit remains disabled; branch names use the request-derived slug.
  - Verification: `bun test test/core-new.test.ts`

