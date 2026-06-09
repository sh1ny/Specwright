# Sources

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## URLs

- https://cli.github.com/manual/gh_help_environment — Official GitHub CLI environment reference. `GH_TOKEN`/`GITHUB_TOKEN` avoid auth prompts for github.com/ghe.com; `GH_HOST` selects a host when not inferred; `GH_PROMPT_DISABLED` disables interactive prompting; notifier env vars can suppress update noise.
- https://cli.github.com/manual/gh_pr_create — Official `gh pr create` reference. Supports `--title`, `--body-file`, `--base`, and `--head`; prompts when branch push target or title/body are not supplied; omitted base falls back to branch `gh-merge-base` config or repository default.

## Local references

- `.specwright/changes/0005-integrate-git-and-gh-commands/intent.md` — Approved goal/non-goals: lifecycle automation, explicit commit helper, no arbitrary pass-through primary feature, no interactive `gh auth login`.
- `.specwright/changes/0005-integrate-git-and-gh-commands/constraints.md` — Product/technical constraints: branch `kind/id-slug`, auto-commit on, publish off, modes `none|push|pr`, argument arrays, explicit file lists, noninteractive `gh`.
- `.specwright/changes/0005-integrate-git-and-gh-commands/decisions.md` — Settled direction: mirror GSD-core explicit commit helper; `workflow` config namespace; rich PR body.
- `src/core/commands.ts` — Current CLI parser, config descriptors/validation, `new`, prompt rendering, and dispatch seams.
- `src/core/types.ts` and `src/core/state.ts` — Current typed config/default config lack a `workflow` namespace; `ChangeState` already has `kind`, `id`, and `slug`.
- `src/runtime/omp/extension.ts` — OMP sends prompts via `pi.sendUserMessage`; no terminal stdin path.
- `test/core-commands.test.ts` and `test/core-prompts.test.ts` — Current tempdir command tests and prompt-content assertions.
- `/home/bgshi/Development/Others/gsd-core/src/commands.cts:536-590` — GSD-core creates/switches branch before committing and stages explicit file lists when supplied.
- `/home/bgshi/Development/Others/gsd-core/gsd-core/workflows/ship.md:29-35,92-171,245-261` — GSD base branch detection, rich PR body sections, and `gh pr create --body-file --base`.
- `/home/bgshi/Development/Others/gsd-core/gsd-core/workflows/execute-phase.md:599-625` — GSD execute prompts require atomic task commits before returning.
