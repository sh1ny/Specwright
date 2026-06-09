# Constraints

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Product constraints

- Branch names use `kind/id-slug`, e.g. `feature/0005-integrate-git-and-gh-commands`.
- Auto-commit is enabled by default.
- Publishing is disabled by default and controlled by workflow config.
- Publish modes should support at least `none`, `push`, and `pr`.
- `publishMode=pr` should produce a GSD-style rich PR body from Specwright artifacts, not a bare placeholder.

## Technical constraints

- Use explicit deterministic commit/checkpoint commands invoked by generated prompts; do not add hidden post-command git hooks.
- Commit scope comes from an explicit file list supplied by the agent/prompt; do not stage unrelated user edits.
- Execute git and gh via argument arrays, not shell string interpolation.
- Keep GitHub CLI behavior noninteractive: fail fast unless existing auth/env is available; disable gh prompts/notifiers where applicable.
- Current OMP prompt delivery is non-terminal, so no flow may depend on terminal stdin.

## Open constraints

- Exact PR body section schema and base-branch detection rules should be researched against GSD-core and current Specwright artifacts.

