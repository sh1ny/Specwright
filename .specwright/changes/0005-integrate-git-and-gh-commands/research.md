# Research

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local findings

- Current Specwright has no git/gh implementation surface. Search across `src`, `test`, `packs/core`, and `.omp` found only prose mentions of "checkpoint" in prompts/tests, not lifecycle branch/commit/publish commands.
- Command integration is centralized in `src/core/commands.ts`: `parseArgs` owns supported flags, `CONFIG_KEY_DESCRIPTORS` and `validateSpecwrightConfig` own config keys, `commandNew` creates the `id-slug` scaffold, lifecycle commands render prompts inline, and `runSpecwrightCommand` dispatches explicit command cases.
- Config currently has no `workflow` namespace. `SpecwrightConfig` contains `project`, `defaults`, `packs`, and `runtimes.omp`; `defaultConfig` and `loadConfig` merge only those namespaces.
- OMP delivery is non-terminal: the extension waits for idle, runs `runSpecwrightCommand`, notifies, then sends `result.prompt` via `pi.sendUserMessage`. Any checkpoint helper must therefore be deterministic CLI text in generated prompts, not stdin-driven interaction.
- Tests are Bun unit tests against `runSpecwrightCommand(ctx, argv)` in temp dirs. There is no existing process execution wrapper; git/gh behavior should be covered by tmpdir git repos and stubbed `gh`/PATH where needed.
- GSD-core precedent supports this shape: its helper creates/switches a branch before first commit, stages caller-supplied files when present, and ship flow detects base branch from config, `origin/HEAD`, then `main`.

## External findings

- GitHub CLI documents `GH_TOKEN`/`GITHUB_TOKEN`, `GH_HOST`, `GH_NO_UPDATE_NOTIFIER`, `GH_NO_EXTENSION_UPDATE_NOTIFIER`, and `GH_PROMPT_DISABLED`; these support fail-fast noninteractive `gh` execution.
- `gh pr create` prompts if the branch is not pushed or if title/body are missing. Supplying `--title`, `--body-file`, `--base`, and preferably `--head` avoids the title/body prompts and makes base/head selection explicit.

## Implications

- Add curated commands rather than pass-through: `new` branch/scaffold commit, `commit`/`checkpoint` with explicit `--files`, and `publish` for `none|push|pr`.
- Add `workflow` config keys: `autoCommit`, `publishMode`, likely `baseBranch`, and optional remote/head controls. Defaults should preserve current behavior except enabled local auto-commit.
- PR body should be generated from Specwright artifacts with stable core sections: Summary, Changes, Verification, Key Decisions, Evidence/Sources, and Handoff/Next Steps. Omit empty sections rather than rendering placeholders.
- Base branch detection should be deterministic: config override first, then `git symbolic-ref refs/remotes/origin/HEAD`, fallback `main`.

