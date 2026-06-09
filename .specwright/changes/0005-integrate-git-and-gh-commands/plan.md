# Plan

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Source summary

- Local command/config seams are centralized in `src/core/commands.ts`, `src/core/types.ts`, `src/core/state.ts`, and `src/core/prompts.ts`; there is no existing git/gh implementation surface to extend (`evidence.md:5-16`).
- OMP sends generated prompt text through a non-terminal path, so every git/GitHub operation must be an explicit deterministic CLI command embedded in prompts, not an interactive stdin flow (`evidence.md:10-14`).
- GSD-core provides precedent for feature-branch creation, explicit file staging, base-branch detection, and rich PR body sections (`evidence.md:16`).
- GitHub CLI supports noninteractive auth/env controls via `GH_TOKEN`/`GITHUB_TOKEN`, `GH_PROMPT_DISABLED`, and notifier-disabling env vars: https://cli.github.com/manual/gh_help_environment.
- `gh pr create` prompts unless title/body and branch/base are explicit; use `--title`, `--body-file`, `--base`, and `--head` to avoid those prompts: https://cli.github.com/manual/gh_pr_create.

## Decision

Build curated Specwright lifecycle commands, not arbitrary git/gh pass-through (`evidence.md:25-31`).

- Extend config with `workflow.autoCommit: boolean` defaulting to `true`, `workflow.publishMode: "none" | "push" | "pr"` defaulting to `"none"`, `workflow.baseBranch?: string`, and `workflow.remote: string` defaulting to `"origin"`.
- `specwright new <kind> <slug>` creates/switches to branch `kind/id-slug` before writing the change scaffold when run inside a git worktree. If no git worktree exists, scaffold creation still succeeds and reports that git automation was skipped.
- When `workflow.autoCommit` is enabled and git is available, `new` commits only the files it created or updated for that change.
- Add `specwright commit` with `specwright checkpoint` as an alias. The command requires an explicit `--files` list and exactly one completed unit selector: `--phase <name>` or `--task T###`. It stages only those files and commits with a deterministic Specwright message derived from the active change and selected unit.
- Generated lifecycle prompts include a checkpoint instruction after successful phase/task completion, with the concrete files the agent is expected to pass to `--files`.
- Add `specwright publish [--mode none|push|pr]`. Omitted mode reads `workflow.publishMode`; `none` is a no-op, `push` pushes the current branch to `workflow.remote`, and `pr` pushes then creates a GitHub PR.
- PR mode resolves base branch in this order: `workflow.baseBranch`, `git symbolic-ref refs/remotes/<remote>/HEAD`, then `main`, matching the researched GSD-core fallback (`evidence.md:16,24`).
- PR bodies are generated from Specwright artifacts with stable sections: Summary, Changes, Verification, Key Decisions, Evidence/Sources, and Handoff/Next Steps. Empty sections are omitted.
- All git/gh execution uses argument arrays. `gh` execution sets `GH_PROMPT_DISABLED=1`, `GH_NO_UPDATE_NOTIFIER=1`, and `GH_NO_EXTENSION_UPDATE_NOTIFIER=1`, and fails fast if existing auth/env is unavailable (`evidence.md:16,29-31`; https://cli.github.com/manual/gh_help_environment).

## Implementation plan

1. Add workflow config typing, defaults, descriptor metadata, and validation in the existing config seams.
2. Add a small git/GitHub execution helper that wraps `Bun.spawn`/process execution with argument arrays, captures stdout/stderr, detects git worktrees, computes branch names, stages explicit file lists, commits, pushes, resolves base branch, and invokes `gh` noninteractively.
3. Wire `new` to branch before scaffolding and auto-commit the scaffold/state files it touched when enabled.
4. Add `commit`/`checkpoint` command parsing, validation, dispatch, help text, and prompt renderer clauses.
5. Add `publish` command parsing, PR body generation from artifacts, push/PR execution, and help text.
6. Add focused Bun tests for config validation, parser errors, branch/commit behavior in temporary git repos, explicit file scoping, prompt checkpoint text, noninteractive `gh` invocation via stubbed PATH, and publish mode behavior.

## Risks

- Staging unrelated user edits would violate the core constraint. Mitigation: require `--files`, validate paths stay inside the project, and stage only those arguments.
- Hidden interactivity would hang OMP flows. Mitigation: no terminal prompts, explicit `gh` flags, prompt-disabling env vars, and tests with a stubbed `gh` command.
- Existing non-git tempdir tests could regress if `new` assumes git. Mitigation: git detection must skip automation while preserving scaffold behavior outside a worktree.
- PR body generation can drift into placeholder text. Mitigation: omit empty artifact-derived sections and test bodies from populated and sparse artifacts.
