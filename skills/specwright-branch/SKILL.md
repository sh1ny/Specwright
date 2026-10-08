---
name: specwright-branch
description: "MANDATORY gate when a new OpenSpec change starts: /opsx:new, /opsx:propose, /opsx:ff, openspec-new-change, openspec-propose, openspec-ff-change, `openspec new change`, or the user asks to start/propose a change. Runs BEFORE any change file exists: checks the repo is on a clean main branch, then creates <prefix>/<change-name>."
metadata:
  version: 0.1.7
user-invocable: false
allowed-tools: Bash(git *) Bash(openspec *)
---

# Specwright Branch

Insert a git gate in front of the vanilla change-creation workflow. Run no OpenSpec command that writes until the gate passes (`openspec list --json` only reads). Stop and ask at every failed check; never proceed silently.

1. **Planning repo** (below) first: a stop there creates no branch. **Inspect in one call:** `git rev-parse --is-inside-work-tree && git branch --show-current && git status --porcelain`. Not a repo → stop and ask (recommend abort).
2. **Change name:** use the user's kebab-case name verbatim; otherwise derive one from the description (lowercase, spaces to hyphens, drop other characters). This name is authoritative: pass it verbatim to `openspec new change` and the triggering workflow; never let them derive another.
3. **Main branch:** `main_branch` in `openspec/specwright.yaml`, else `main`, else `master` (`git rev-parse --verify`), else ask.
4. **Not on main** → stop. Offer: switch to main (only if the tree is clean apart from step 5's carry-over), or abort.
5. **Dirty tree:** untracked files only under `<P>/changes/<change-name>/` are this change's artifacts, created before the gate ran (or when apply found the change on main): they carry over to the new branch, so continue. Anything else → stop and show `git status --short`. Offer: commit first, stash (`git stash push -u -m "specwright-branch: pre-<change-name>" -- <those paths>`, report the ref), or abort.
6. **Prefix** from the name's first token: add/feat/feature/implement/introduce → `feat`; fix/bugfix/hotfix/patch/resolve → `bugfix`; refactor/restructure/cleanup → `refactor`; docs/doc/document → `docs`; chore/bump/deps/ci/build → `chore`; anything else → `feat` (say so in one line).
7. **Existing branch** `<prefix>/<change-name>` → stop. Offer: switch to it and resume the change (do not re-scaffold), pick another name, or abort.
8. `git checkout -b <prefix>/<change-name>`, announce `On branch <prefix>/<change-name> (from <main>)`, then hand back to the triggering workflow. If the change directory already exists, tell the workflow to continue it rather than create it again.

If the roadmap (`project.roadmap`, default `openspec/roadmap.md`) exists and the user did not say which milestone this change serves, ask, so the proposal can name it.

One working tree holds one change at a time: this skill switches the branch of the whole checkout. When several agents work on the project at once, each change needs its own `git worktree`.

Never commit or push here.

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
