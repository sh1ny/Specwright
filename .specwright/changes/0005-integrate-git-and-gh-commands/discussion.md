# Discussion

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Conversation notes

- 2026-06-08 checkpoint — Asked whether 0005 should expose curated wrappers, pass-through wrappers, workflow commands, or both. Settled direction: this change is not primarily a manual `git`/`gh` command surface; it should add lifecycle automation that creates a feature branch when a change is created, commits completed lifecycle artifacts after each phase, and pushes when a workflow is done, with config for auto-commit and auto-push. Source evidence: current CLI dispatch is explicit command cases in `src/core/commands.ts:739-763`; current parser treats unknown `--*` flags globally in `src/core/commands.ts:103-145`, so arbitrary pass-through would be a different design.
- 2026-06-08 checkpoint — Asked how `gh` auth and prompting should behave. Settled: fail fast and noninteractive; require existing GitHub CLI auth or environment token/host and do not run terminal login prompts. Source evidence: GitHub CLI documents `GH_TOKEN`, `GH_HOST`, and `GH_PROMPT_DISABLED` in `https://cli.github.com/manual/gh_help_environment`; OMP command handling sends generated prompts through `pi.sendUserMessage` after `waitForIdle`, not through an interactive terminal, in `src/runtime/omp/extension.ts:12-27`.
- 2026-06-08 checkpoint — Refined scope after user clarified the feature is lifecycle automation. Settled: mirror GSD-core's explicit commit-helper pattern rather than hidden global hooks. `specwright new` should create/switch to a `kind/id-slug` branch and commit the created change scaffold directly; generated phase/task prompts should require the receiving agent to call a deterministic Specwright commit/checkpoint helper after completing the phase/task. Source evidence: GSD defaults `commit_docs` to true in `/home/bgshi/Development/Others/gsd-core/gsd-core/bin/shared/config-defaults.manifest.json:4`; its commit helper creates/switches branches before first commit in `/home/bgshi/Development/Others/gsd-core/src/commands.cts:536-572`; workflows call `gsd_run query commit ... --files ...` explicitly in `/home/bgshi/Development/Others/gsd-core/gsd-core/workflows/docs-update.md:1072-1084`.
- 2026-06-08 checkpoint — Settled commit scope: agents pass an explicit file list to the commit/checkpoint helper; Specwright should commit files touched by the phase/task, including code and Markdown, but leave unrelated non-touched files out. Source evidence: GSD stages explicit files when provided and otherwise falls back to planning files in `/home/bgshi/Development/Others/gsd-core/src/commands.cts:574-590`; GSD execute prompts require each task to be committed atomically in `/home/bgshi/Development/Others/gsd-core/gsd-core/workflows/execute-phase.md:599-625`.
- 2026-06-08 checkpoint — Settled branch/message/publish/config direction: branch names use `kind/id-slug` (for example `feature/0005-integrate-git-and-gh-commands`); local auto-commit defaults on; publish defaults off via configurable workflow publish mode; `publishMode=pr` should push and create a GSD-style rich PR body from Specwright artifacts. Source evidence: current Specwright change state already carries `kind`, four-digit `id`, and `slug` in `src/core/commands.ts:416-465`; GSD ship performs verification/remote/gh preflight before push/PR in `/home/bgshi/Development/Others/gsd-core/gsd-core/workflows/ship.md:39-75` and creates PRs with `gh pr create --body-file` in lines 245-261.

## Open questions

- None for discussion. Research should still validate exact PR body sections and base branch detection against GSD-core and current Specwright artifacts.

## Settled decisions

- Lifecycle automation with GSD-style explicit commit helper.
- Explicit touched-file lists for commits.
- Noninteractive `gh` behavior.
- Branch scheme `kind/id-slug`.
- Config under `workflow`; auto-commit on by default; publish off by default; publish modes include `none`, `push`, `pr`.
