---
name: specwright-commit
description: "MANDATORY during the OpenSpec apply phase: /opsx:apply, openspec-apply-change, `openspec instructions apply`, or the user asks to implement/apply an OpenSpec change. Commits each completed task on the change branch, verifies the commits when all tasks are done, then hands off to archive or to the PR."
metadata:
  version: 0.1.7
user-invocable: false
allowed-tools: Bash(git *) Bash(openspec *)
---

# Specwright Commit

Wraps the vanilla apply loop. The vanilla workflow still owns change selection, instructions and progress; this skill owns commits.

Commit type: the branch prefix, except `bugfix` → `fix`. Below, `<type>(<change-name>)` means that.

## 1. Before the first task
- Note any files that are already untracked or modified and not part of the change (`git status --porcelain`). They belong to the user: never commit them, and do not count them against the clean-tree check later.
- `git branch --show-current`. On `<prefix>/<change-name>` → use both parts in every message. On main → stop and offer to run `specwright-branch` now (the change's uncommitted artifacts carry over) or to continue without commits. Any other branch → confirm with the user first.
- The change must live in this repository. If `planningHome.root` from `openspec instructions apply --json` is outside it (a standalone store), stop: Specwright does not commit planning stores; ask whether to continue without planning commits.
- Uncommitted planning files → one call: `git add -- openspec/changes/<change-name>/ && git commit -F <msgfile> -- openspec/changes/<change-name>/` with subject `<type>(<change-name>): add planning artifacts`. Never stage all of `openspec/`: other files there belong to the user.

## 2. After each task is ticked `[x]`
One commit per task, in **one shell call**: `git branch --show-current` must still print the change branch (stop if not), then `git add -- <paths> && git commit -F <msgfile> -- <paths>`.
- `<paths>`: the files this task changed plus `tasks.md`, by name. Never `git add -A` / `git add .`. An unexpected changed file is a question for the user, not something to sweep in.
- Subject: `<type>(<change-name>): task X.Y <task text>`, at most 72 characters (cut at a word boundary). Write the message to a temp file so quotes and `$` survive any shell.
- Follow the user's commit identity and trailer rules (CLAUDE.md / AGENTS.md).
- Nothing to commit → note the task as no-op for the final report.
- When a `specwright-implementer` returns, before verifying its group: check for shells or background tasks it left running (your harness's task or process list), stop any you find and say so in the report, then run `git status --porcelain` again. A late writer may have changed or added files, so verify only after this.
- When a `specwright-implementer` did a group, commit its tasks one by one in order after verifying: each task's files with that task (a file two tasks touched goes with the later one). Re-run each task's green verification yourself; its report is not evidence. A red-confirmation task is the one exception: the test is green by now, so accept the report's exact command and failure output for it, and say so in the commit body.
- Drift amendments to proposal, specs, design or review.md: commit them by name as `<type>(<change-name>): amend <artifact>` before resuming tasks.

## 3. When every task is `[x]`
One call: `git log <main>..HEAD --oneline && git status --porcelain`. Every checked `X.Y` needs a commit whose subject contains `task X.Y ` (with the trailing space, so 1.1 does not match 1.10), and the tree must be clean apart from the files noted in step 1 (and build or test byproducts such as `__pycache__`, which you may delete if you created them). Report `<N> tasks, <M> task commits, tree clean`, listing the pre-existing files you left alone. On a gap, stop and offer: commit the leftovers (by name), amend (only if the user picks it), or investigate.

Then read `finish` in `openspec/specwright.yaml` (default `local`):
- `local` → suggest `/opsx:archive`; the user runs it.
- `pr` → hand off to `specwright-pr` **ship**, then offer **watch**. Archive after review settles, on the same branch, before the PR is merged: **watch** offers it once the PR is ready.

Never commit on main, push from this skill, batch tasks into one commit, amend unprompted, or start archive yourself.
