---
name: specwright-finish
description: "MANDATORY after the OpenSpec archive workflow completes: /opsx:archive, /opsx:bulk-archive, openspec-archive-change, `openspec archive`, or the user asks to archive/finish a change. Commits the archive move, then merges locally (finish: local) or pushes to the PR (finish: pr). Also handles 'the PR was merged' cleanup."
metadata:
  version: 0.1.1
user-invocable: false
allowed-tools: Bash(git *) Bash(openspec *)
---

# Specwright Finish

Start only after the vanilla archive workflow reports success (for bulk archive: after all of it). If it failed, do nothing.

1. **Branch:** `git branch --show-current`. On main → report `No branch to merge - archive completed on <main>` and stop. If the branch's change name differs from the archived change, confirm with the user.
2. **Archive commit**, one call: `git add -- openspec/ && git commit -F <msgfile> -- openspec/` with `<prefix>(<change-name>): archive change`, then `git status --porcelain` must be empty (else stop and list the files). Bulk archive of several changes on one branch → one archive commit naming them all.
3. **Finish** per `finish` in `openspec/specwright.yaml` (default `local`). Main branch: `main_branch` setting, else `main`, else `master`, else ask.

## local
- Write the merge message to a file first - subject `merge: <change-name>` plus any trailers the user's commit rules require - because fixing a commit afterwards means amending, which this workflow never does unprompted. Then one call: `git checkout <main> && git merge --no-ff <prefix>/<change-name> -F <msgfile>`. On conflict: stop, list the files, offer manual resolution or `git merge --abort`. Never resolve conflicts yourself.
- `git branch -d <prefix>/<change-name>` (never `-D`). Report the merge commit and `Local only - push <main> when ready.` Never push.

## pr
- Push the archive commit through `specwright-pr` (it pins the GitHub identity and runs `pr.validate`). No PR yet → run `specwright-pr` **ship**.
- Report the PR URL and `Ready to merge on GitHub once checks and reviews are green.` Never merge the PR.
- **After the PR is merged** (the user says so, or `gh pr view <branch> --json state,headRefOid` shows MERGED): `git checkout <main> && git pull --ff-only && git branch -d <prefix>/<change-name>`. If `-d` refuses because GitHub squashed or rebased, use `-D` only when the PR is MERGED and its `headRefOid` equals the local branch tip; otherwise ask.
- If the roadmap (`project.roadmap`) exists, offer `specwright-roadmap` **next** (or **close** if this was the milestone's last change).
