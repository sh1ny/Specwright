---
name: specwright-commit
description: "MANDATORY during the OpenSpec apply phase: /opsx:apply, openspec-apply-change, `openspec instructions apply`, or the user asks to implement/apply an OpenSpec change. Commits each completed task on the change branch, verifies the commits when all tasks are done, then hands off to archive or to the PR."
metadata:
  version: 0.1.0
user-invocable: false
allowed-tools: Bash(git *) Bash(openspec *)
---

# Specwright Commit

Wraps the vanilla apply loop. The vanilla workflow still owns change selection, instructions and progress; this skill owns commits.

## 1. Before the first task
- Note any files that are already untracked or modified and not part of the change (`git status --porcelain`). They belong to the user: never commit them, and do not count them against the clean-tree check later.
- `git branch --show-current`. On `<prefix>/<change-name>` → use both parts in every message. On main → stop and offer to run `specwright-branch` now (uncommitted artifacts carry over) or to continue without commits. Any other branch → confirm with the user first.
- Uncommitted planning files → one call: `git add -- openspec/ && git commit -F <msgfile> -- openspec/` with subject `<prefix>(<change-name>): add planning artifacts`.

## 2. After each task is ticked `[x]`
One commit per task, in **one shell call**: `git add -- <paths> && git commit -F <msgfile> -- <paths>`.
- `<paths>`: the files this task changed plus `tasks.md`, by name. Never `git add -A` / `git add .`. An unexpected changed file is a question for the user, not something to sweep in.
- Subject: `<prefix>(<change-name>): task X.Y <task text>`, at most 72 characters (cut at a word boundary). Write the message to a temp file so quotes and `$` survive any shell.
- Follow the user's commit identity and trailer rules (CLAUDE.md / AGENTS.md).
- Nothing to commit → note the task as no-op for the final report.
- When a `specwright-implementer` did the work, re-run the task's verification yourself before ticking and committing. Its report is not evidence.

## 3. When every task is `[x]`
One call: `git log <main>..HEAD --oneline && git status --porcelain`. Every checked `X.Y` needs a commit containing `task X.Y`, and the tree must be clean apart from the files noted in step 1 (and build or test byproducts such as `__pycache__`, which you may delete if you created them). Report `<N> tasks, <M> task commits, tree clean`, listing the pre-existing files you left alone. On a gap, stop and offer: commit the leftovers (by name), amend (only if the user picks it), or investigate.

Then read `finish` in `openspec/specwright.yaml` (default `local`):
- `local` → suggest `/opsx:archive`; the user runs it.
- `pr` → hand off to `specwright-pr` **ship**, then offer **watch**. Archive after review settles, on the same branch.

Never commit on main, push from this skill, batch tasks into one commit, amend unprompted, or start archive yourself.
