---
name: specwright-branch
description: "MANDATORY gate when a new OpenSpec change starts: /opsx:new, /opsx:propose, /opsx:ff, openspec-new-change, openspec-propose, openspec-ff-change, `openspec new change`, or the user asks to start/propose a change. Runs BEFORE any change file exists: checks the repo is on a clean main branch, then creates <prefix>/<change-name>."
metadata:
  version: 0.1.0
user-invocable: false
allowed-tools: Bash(git *) Bash(openspec *)
---

# Specwright Branch

Insert a git gate in front of the vanilla change-creation workflow. Run nothing from `openspec` until the gate passes. Stop and ask at every failed check; never proceed silently.

1. **Inspect in one call:** `git rev-parse --is-inside-work-tree && git branch --show-current && git status --porcelain`. Not a repo → stop and ask (recommend abort).
2. **Change name:** use the user's kebab-case name verbatim; otherwise derive one from the description (lowercase, spaces to hyphens, drop other characters).
3. **Main branch:** `main_branch` in `openspec/specwright.yaml`, else `main`, else `master` (`git rev-parse --verify`), else ask.
4. **Not on main** → stop. Offer: switch to main (only if the tree is clean), or abort.
5. **Dirty tree** → stop and show `git status --short`. Offer: commit first, stash (`git stash push -u -m "specwright-branch: pre-<change-name>"`, report the ref), or abort.
6. **Prefix** from the name's first token: add/feat/feature/implement/introduce → `feat`; fix/bugfix/hotfix/patch/resolve → `bugfix`; refactor/restructure/cleanup → `refactor`; docs/doc/document → `docs`; chore/bump/deps/ci/build → `chore`; anything else → `feat` (say so in one line).
7. **Existing branch** `<prefix>/<change-name>` → stop. Offer: switch to it and resume the change (do not re-scaffold), pick another name, or abort.
8. `git checkout -b <prefix>/<change-name>`, announce `On branch <prefix>/<change-name> (from <main>)`, then hand back to the triggering workflow.

If the roadmap (`project.roadmap`, default `openspec/roadmap.md`) exists and the user did not say which milestone this change serves, ask, so the proposal can name it.

Never commit or push here.
