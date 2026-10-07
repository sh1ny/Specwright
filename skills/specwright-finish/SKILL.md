---
name: specwright-finish
description: "MANDATORY after the OpenSpec archive workflow completes: /opsx:archive, /opsx:bulk-archive, openspec-archive-change, `openspec archive`, or the user asks to archive/finish a change. Commits the archive move, then merges locally (finish: local) or pushes to the PR (finish: pr). Also handles 'the PR was merged' cleanup."
metadata:
  version: 0.1.5
user-invocable: false
allowed-tools: Bash(git *) Bash(openspec *)
---

# Specwright Finish

Start only after the vanilla archive workflow reports success (for bulk archive: after all of it). If it failed, do nothing.

Commit type: the branch prefix, except `bugfix` → `fix`. Archive paths: `openspec/changes/<change-name>/` (now removed), `openspec/changes/archive/<dated-name>/`, and for each delta `specs/<capability-path>/spec.md` inside the archived change, the main spec `openspec/specs/<capability-path>/spec.md` it updated or created - by file, never the whole `openspec/specs/` directory. Other files are the user's: never stage them.

1. **Branch:** `git branch --show-current`. If the branch's change name differs from the archived change, confirm with the user. On main:
   - No archive changes left uncommitted (the archive already reached main) → report `Nothing to finish - archive is on <main>` and stop.
   - Otherwise (the PR merged before archive ran; normally `specwright-pr` **watch** archives on the PR branch first) → offer `git checkout -b chore/archive-<change-name>`; the uncommitted archive carries over. Continue from step 2 on that branch, or stop if the user declines. Never commit on main.
2. **Archive commit**, one call: `git add -- <archive paths> && git commit -F <msgfile> -- <archive paths>` with `<type>(<change-name>): archive change`. Then `git status --porcelain`: nothing may be left under `openspec/changes/<change-name>/` or the archive directory, and none of the listed spec files (else stop and list it); other leftovers, including other files under `openspec/`, are the user's - list them and continue. Bulk archive of several changes on one branch → one archive commit naming them all.
3. **Finish** per `finish` in `openspec/specwright.yaml` (default `local`). Main branch: `main_branch` setting, else `main`, else `master`, else ask.

## local
- Write the merge message to a file first - subject `merge: <change-name>` plus any trailers the user's commit rules require - because fixing a commit afterwards means amending, which this workflow never does unprompted. Then one call: `git checkout <main> && git merge --no-ff <branch> -F <msgfile>`. On conflict: stop, list the files, offer manual resolution or `git merge --abort`. Never resolve conflicts yourself.
- `git branch -d <branch>` (never `-D`). Report the merge commit and `Local only - push <main> when ready.` Never push.

## pr
- Run `specwright-pr` **ship**: it pushes the archive commit (pinning the GitHub identity and running `pr.validate`) and opens the PR if there is none, leaving an existing PR's description alone.
- If `specwright-pr` **watch** started this archive, hand back to it: it waits for CI and reviews on the archive head before reporting ready. Otherwise report the PR URL and `Ready to merge on GitHub once checks and reviews are green.`, and offer **watch**. Never merge the PR.
- **After the PR is merged** (the user says so, or `gh pr view <branch> --json state,headRefOid` shows MERGED): `git checkout <main> && git pull --ff-only && git branch -d <branch>`. If `-d` refuses because GitHub squashed or rebased, use `-D` only when the PR is MERGED and its `headRefOid` equals the local branch tip; otherwise ask.

If the roadmap (`project.roadmap`) exists, offer `specwright-roadmap` **next** (or **close** if this was the milestone's last change) once the change is on main: after the local merge, or after the PR is merged.
