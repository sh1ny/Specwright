# Constraints

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Product constraints

- `specwright new` must treat the implementation request as source intent, not as a manually authored title.
- The existing explicit title input contract must be removed from CLI help, validation errors, tests, and OMP-facing usage text.
- Longer inline request text must be accepted as trailing positionals after `<kind>`.
- The raw assembled source request must be preserved in `intent.md` so later lifecycle phases can cite exact user wording.
- No downstream lifecycle behavior changes are in scope except usage/help text that reflects the new `new` contract.

## Technical constraints

- Support local `@file` references only.
- Resolve `@file` paths relative to the command working directory unless already absolute.
- Reject missing files, directories, globs, URLs, stdin references, and unreadable file references with actionable errors.
- Enforce a bounded file-size limit for expanded `@file` content.
- Use deterministic request-derived title/slug generation for this change; do not require network, model, OMP agent, or stdin wizard availability.
- Preserve existing git worktree behavior: create the change branch from the derived slug and commit only scaffold/state files when auto-commit is enabled.

## Open constraints

- None.