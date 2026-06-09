# Evidence

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local evidence

- `src/core/commands.ts:96-145` parses a fixed flag set and rejects unknown `--*`; arbitrary pass-through would conflict with current parser shape.
- `src/core/commands.ts:200-282` is the existing config key/validation seam; no `workflow.*` descriptors exist.
- `src/core/commands.ts:416-465` creates change state and scaffold files; state already exposes `kind`, `id`, and `slug` needed for `kind/id-slug` branch names.
- `src/core/commands.ts:489-626` renders lifecycle prompts inline. `src/core/prompts.ts:1-47` has reusable prompt helpers and is the cleaner home for a checkpoint clause.
- `src/core/commands.ts:739-783` dispatches explicit commands and help text; adding `commit`/`checkpoint` and `publish` requires new cases and help entries.
- `src/core/types.ts:21-42` and `src/core/state.ts:6-65` define/merge config without `workflow`; implementation must extend types, defaults, load merge, descriptors, and validators together.
- `src/runtime/omp/extension.ts:12-27` runs commands and sends generated prompts to the agent; no command flow can rely on interactive terminal stdin.
- `test/core-commands.test.ts:1-14,57-124` shows tempdir command/config tests; `test/core-prompts.test.ts:7-64` shows prompt assertions for lifecycle prompt content.
- Repository search for `git|gh|branch|commit|publish|pull request|PR|checkpoint` in `src`, `test`, `packs/core`, and `.omp` found no existing git/gh implementation; only prose "checkpoint" prompt/test mentions.
- GSD-core evidence: `/home/bgshi/Development/Others/gsd-core/src/commands.cts:536-590` creates/switches branches and stages explicit files; `/home/bgshi/Development/Others/gsd-core/gsd-core/workflows/ship.md:29-35` detects base branch from config, `origin/HEAD`, then `main`; lines `92-171` define rich PR body sections; lines `245-261` use `gh pr create --body-file --base`.

## Research attempts

- Ran two read-only scout agents. `CommandArchitectureScout` mapped command/config/prompt/test seams; `GitGhEvidenceScout` searched for git/gh/branch/commit/publish/PR/checkpoint surfaces. Both succeeded, so no fallback retry was required.
- Used LSP `symbols` on `src/core/commands.ts` to confirm central command/config/prompt symbols and dispatch locations.
- Used local `search` for git/GitHub terms across `src`, `test`, `packs/core`, and `.omp`; result confirmed absence of implementation code.
- Used `web_search` and `read` on official GitHub CLI docs because current noninteractive `gh` behavior and PR flags matter for this change.

## Decisions supported

- Build curated lifecycle commands, not arbitrary git/gh pass-through.
- Require explicit `--files` for checkpoint commits to avoid staging unrelated user work.
- Use argument arrays/process execution wrappers for git/gh and set noninteractive `gh` environment.
- Add workflow config with auto-commit enabled and publish disabled by default.
- Generate PR bodies from Specwright artifacts and use explicit base/head flags for `gh pr create`.
