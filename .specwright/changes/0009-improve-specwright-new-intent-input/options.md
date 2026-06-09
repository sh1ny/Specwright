# Options

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Option 1

Minimal inline change in `commandNew`.

- Join `args.positionals.slice(1)` into the source request inside `commandNew`.
- Expand local `@file` tokens and derive the deterministic title in the same function.
- Add the raw source request to intent rendering, then reuse existing state, branch, template, and auto-commit flow.

Tradeoffs: smallest diff and lowest lifecycle risk, but `commandNew` would mix parsing, filesystem validation, title derivation, and rendering responsibilities.

## Option 2

Focused helpers for request assembly and title derivation.

- Add small helpers such as `assembleSourceRequest(cwd, tokens)`, `expandRequestToken(cwd, token)`, and `deriveTitleFromRequest(request)`.
- Keep `commandNew` orchestration-oriented: validate kind, assemble request, derive title/slug, render artifacts with source request, preserve git/state flow.
- Unit-test multi-token requests, `@file` success, missing file, directory, glob/URL/stdin rejection, unreadable/oversize files, empty request, and deterministic title edge cases.

Tradeoffs: modestly larger diff, but isolates risky input/file handling and makes edge-case tests clearer without changing public state types.

## Recommendation

Choose Option 2. The change adds enough edge cases that helper-level tests are safer than embedding everything in `commandNew`. Keep the seam local and boring; avoid a general prompt-ingestion abstraction until model-assisted title generation exists.