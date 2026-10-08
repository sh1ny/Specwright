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
- **Planning repo** (below). Store-backed: planning files are committed in the store, on its `<prefix>/<change-name>` branch; task code is committed here. Note the store's pre-existing files too.
- Uncommitted planning files → one call in the planning repo (store-backed: start it with `cd "<store toplevel>" && test "$(git branch --show-current)" = <branch> &&`): `git add -- <P>/changes/<change-name>/ && git commit -F <msgfile> -- <P>/changes/<change-name>/` with subject `<type>(<change-name>): add planning artifacts`. Never stage all of `<P>/`: other files there belong to the user.

## 2. After each task is ticked `[x]`
One commit per task, in **one shell call**: `git branch --show-current` must still print the change branch (stop if not), then `git add -- <paths> && git commit -F <msgfile> -- <paths>`.
- `<paths>`: the files this task changed plus `tasks.md`, by name. Store-backed: `tasks.md` is in the store, so the task gets two commits with the same subject: the code files here, then `<P>/changes/<change-name>/tasks.md` in the store (the same one-call form, with the store branch check). Never `git add -A` / `git add .`. An unexpected changed file is a question for the user, not something to sweep in.
- Subject: `<type>(<change-name>): task X.Y <task text>`, at most 72 characters (cut at a word boundary). Write the message to a temp file so quotes and `$` survive any shell.
- Follow the user's commit identity and trailer rules (CLAUDE.md / AGENTS.md).
- Nothing to commit → note the task as no-op for the final report.
- When a `specwright-implementer` returns, before verifying its group: check for shells or background tasks it left running (your harness's task or process list), stop any you find and say so in the report, then run `git status --porcelain` again. A late writer may have changed or added files, so verify only after this.
- When a `specwright-implementer` did a group, commit its tasks one by one in order after verifying: each task's files with that task (a file two tasks touched goes with the later one). Re-run each task's green verification yourself; its report is not evidence. A red-confirmation task is the one exception: the test is green by now, so accept the report's exact command and failure output for it, and say so in the commit body.
- Drift amendments to proposal, specs, design or review.md: commit them by name in the planning repo as `<type>(<change-name>): amend <artifact>` before resuming tasks.

## 3. When every task is `[x]`
One call: `git log <main>..HEAD --oneline && git status --porcelain`. Every checked `X.Y` needs a commit whose subject contains `task X.Y ` (with the trailing space, so 1.1 does not match 1.10), and the tree must be clean apart from the files noted in step 1 (and build or test byproducts such as `__pycache__`, which you may delete if you created them). Report `<N> tasks, <M> task commits, tree clean`, listing the pre-existing files you left alone. Store-backed: run the same check in the store as well and report each repo on its own line. On a gap, stop and offer: commit the leftovers (by name), amend (only if the user picks it), or investigate.

Then read `finish` in `openspec/specwright.yaml` (default `local`):
- `local` → suggest `/opsx:archive`; the user runs it.
- `pr` → hand off to `specwright-pr` **ship**, then offer **watch**. Archive after review settles, on the same branch, before the PR is merged: **watch** offers it once the PR is ready.

Never commit on main, push from this skill, batch tasks into one commit, amend unprompted, or start archive yourself.

## Planning repo

OpenSpec decides where planning lives: in this repo, in a folder nested in it, or in a store (a separate git repo). Resolve it at the start of every run, before any write; never assume `./openspec/`.

1. **Root:** `openspec list --json` from the code checkout, plus `--store <id>` when the session selected a store. It needs no change name, writes nothing and still works after archive. `root` null with an error whose `message` starts with `Declared in` or `Invalid store declaration in` → stop before any git or file write and show that `message` and `fix`.
2. **Repo**, in one call: `git rev-parse --path-format=absolute --git-common-dir --show-toplevel && git -C "<root.path>" rev-parse --path-format=absolute --git-common-dir --show-toplevel`.
   - The second fails (root not in a git work tree) → stop and ask: initialise git there, or abort.
   - Different common dir → **store-backed**: the planning repo is the store checkout at its toplevel.
   - Same common dir and toplevel → **repo-local** (including a root nested in this checkout, such as `planning/`): one repo, as before.
   - Same common dir, different toplevel → the root is in another worktree of this repo, where a commit would land on that worktree's branch. Stop before any write, name both worktrees (path and branch) and ask.
3. Announce once: `Code repo: <toplevel>; planning repo: <toplevel> (store <root.store_id>)` or `(same repo)`.

**Paths.** `<P>` is `<root.path>/openspec` made relative to the planning repo's toplevel (`openspec` in the usual layout, `planning/openspec` for a nested root). Stage and `ls-tree` planning files as `<P>/...` in the planning repo.

**Where commands run.** Git, `gh` and `as.sh` commands on the store run in one shell call that starts with `cd "<store toplevel>" &&` (`as.sh` only fences the repo it starts in). `openspec templates` and `openspec schema validate` have no root selection: run them with `cd "<root.path>" &&`. `git -C` is for read-only queries only (`rev-parse`, `status`, `log`, `ls-tree`).

**Archive name.** Use `archivedAs` from the archive output when you have it. Otherwise it is the change name if that starts with `YYYY-MM-DD-`, else `YYYY-MM-DD-<change-name>`: `<P>/changes/archive/<archived-name>/`.
