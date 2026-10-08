---
name: specwright-roadmap
description: "Project-level planning above OpenSpec changes: strategy, architecture baseline (foundational ADRs) and a milestone roadmap. Modes: init (turn a big project idea or brief into strategy, architecture and roadmap), next (start the next change of the current milestone), close (verify a milestone's exit criteria and plan the next one), status. Triggers: a project idea too big for one change, 'plan this project', 'create a roadmap', 'what's next on the roadmap', 'next change/milestone', 'close the milestone', 'roadmap status', or specwright-finish offering next/close."
metadata:
  version: 0.1.8
---

# Specwright Roadmap

Three project files sit above OpenSpec changes. Paths come from `project:` in `openspec/specwright.yaml`; defaults are below. Templates are in this skill's `references/`.

| File | Default | Holds | Changes |
|---|---|---|---|
| Strategy | `openspec/strategy.md` | Purpose, users, boundaries, metrics | Rarely |
| Architecture | `openspec/architecture.md` | System shape + index of in-force ADRs (`docs/adr/`) | When an ADR is added or superseded |
| Roadmap | `openspec/roadmap.md` | Milestones: outcome, exit criteria, changes | At every milestone close |

Status is derived, never stored. A milestone is done when all its changes are done and every exit criterion has passed. A change's status depends on where its planning lives (**Planning repo** below):

- **Main branches.** In pr mode PRs merge on GitHub, so local `<main>` lags: run `git fetch origin <main>` in each repo (store-backed: the code repo and the store) and read `origin/<main>`. Where there is no `origin` or the fetch fails, read that repo's local `<main>` and say its status may be stale (`store status may be stale: fetch failed`). Local mode reads local `<main>`.
- **Archive.** `git -C <planning toplevel> ls-tree -d --name-only <planning main> <P>/changes/archive/`, matched by the archive name (**Archive name** below: a change named `YYYY-MM-DD-...` is matched as is, never prefixed twice).
- **Repo-local:** a change is **done** when the main branch holds its archive (in pr mode that means its PR merged, not just that archive ran on the branch); otherwise it is not done.
- **Store-backed:** the archive on the store's main shows only that the planning merged. The change is **done** only when the store's main holds its archive and one of these proves the code side merged as a whole:
  - the archive directory on the store's main holds `specwright-change.yaml` with `code_changes: none` (a planning-only change; `git -C <store toplevel> show <store main>:<P>/changes/archive/<archived-name>/specwright-change.yaml`);
  - `local` mode: `git -C <code toplevel> log --first-parent --format=%s <code main>` has the exact subject `merge: <change-name>`;
  - `pr` mode: a merged code PR from the code repo's own `<prefix>/<change-name>` branch into the code main. Find it with complete discovery, run from the code checkout (through `bash <specwright-pr>/scripts/as.sh <github.login>` when `github.login` is set, `<specwright-pr>` being that skill's folder): `gh api --paginate "repos/<owner>/<repo>/pulls?state=closed&base=<code main>&per_page=100" --jq '.[] | select(.merged_at != null and .head.repo.full_name == "<owner>/<repo>" and (.head.ref | endswith("/<change-name>"))) | .number'`, with `<owner>/<repo>` from the code repo's `origin` and `GH_REPO` unset. A PR merged into another base, or from a fork's same-named branch, is not proof.

  A subject that merely contains `(<change-name>)` is not proof: a cherry-picked task commit has it while the rest of the change is unmerged. Without proof the change is **planning merged, code pending**. In pr mode, when `gh` is not available it is **planning merged, code unverified**, and when the discovery call fails (non-zero exit) it is **planning merged, code state unknown**. None of these counts as done, for status, **next** or **close**.

**Committing project files** (init and close): start from a clean main (in pr mode, `git pull --ff-only origin <main>` first) and `git checkout -b <branch>` before writing anything, commit the files you wrote by name with a `docs(<branch-name>): ...` subject, then finish per `finish` in `openspec/specwright.yaml`: `local` → merge into main with `--no-ff` and subject `merge: <branch-name>`, delete the branch, never push; `pr` → `specwright-pr` **ship**. There is no change to archive, so `specwright-finish` does not apply.

## init

Input: the user's project idea (any size), plus the repo if code exists. Work on branch `docs/project-baseline` (see Committing project files).

1. **Adopt before writing.** If strategy, architecture or planning documents already exist, point the `project:` settings at them or extract from them; do not rewrite what is there.
2. **Interview, briefly.** List the gaps that would change the architecture or the first milestone: users, platform, scope and non-goals, hard constraints, data and its sensitivity, success measures. Ask them in at most two batched rounds, each question with a recommended default. Everything else becomes a stated assumption.
3. **Strategy** (`references/strategy.md`), one page.
4. **Architecture baseline** (`references/architecture.md`). Run the design triage (T1-T6 from the schema's design instruction) for the whole system, not one change. Write the component diagram, state ownership, boundaries and contracts, resource bounds and failure visibility at system level - brief, a few lines per row. Record the foundational decisions as ADRs (process and isolate model, storage and formats, IPC and contracts, state management, external integrations), each with a rejected alternative and its reversal cost. Ground in the code if it exists; otherwise check claims about the stack against its docs.
5. **Review** the strategy, architecture and ADRs the same way a FULL design is reviewed (cross-model CLI unless `review.cross_model` is `false`, else the `specwright-reviewer` agent in baseline mode, given those file paths), into `openspec/architecture-review.md`, at most two rounds. This is the one place a review always runs: early architecture mistakes are the most expensive ones. Gate: do not write the roadmap until the review passes the same precheck as tasks (APPROVE; APPROVE_WITH_CHANGES with `CHANGES_APPLIED: yes` set by the reviewer; or USER_OVERRIDE after escalation).
6. **Roadmap** (`references/roadmap.md`):
   - M1 is a walking skeleton: the thinnest end-to-end slice through the architecture, which proves the riskiest assumptions first.
   - Each milestone has a demoable outcome and exit criteria that can be checked, each marked agent- or user-verified.
   - Only the current milestone is split into changes (2-6, each about one PR). Next gets a paragraph, Later one line each.
7. Commit and finish (see Committing project files). Then offer **next**.

## next

1. Read the roadmap's Now section. Run `openspec list --json` for active changes, and derive done changes from the main branch as above.
2. Active change in progress → offer to resume it instead.
3. Otherwise pick the first planned change that has no archive and whose prerequisites are all **done** (a prerequisite that is planning merged, code pending, unverified or unknown is not done). An archived change whose code is pending is never started again: report it and what it is waiting for (its code PR or merge). If none is left but exit criteria still fail, propose a new change that closes the gap and add it to the roadmap.
4. Start `/opsx:propose <change-name>` (`specwright-branch` runs first). Give the proposal its context: the milestone, the exit criteria this change serves, and the ADRs that constrain it. The proposal names its milestone.

## close

1. Every change of the milestone done (on main, as derived above)? If not, list what is left and stop.
2. Walk the exit criteria. Run agent-verifiable checks yourself. Ask the user to run user-verified ones and record their results; anything skipped is recorded as unverified, never passed.
3. Any criterion fails → propose the change that fixes it (via **next**); do not close. Any criterion unverified → list it and stop; the milestone stays in Now until it has a passing result.
4. Close on branch `docs/close-<milestone>` (see Committing project files): move the milestone to Done with the date and one line on what was learned.
5. Re-plan with what the milestone taught: promote Next to Now and split it into changes; revise Later. If an architecture assumption broke, write a superseding ADR and update the architecture index - never edit an accepted ADR.
6. Commit and finish like init.

## status

One answer, no edits: current milestone, its changes (done / planning merged, code pending / code unverified / code state unknown / active / planned, derived as above, one status per change with its proof), the stale note when a fetch failed, exit criteria state, and what **next** would start.

## Rules

- Keep it small: the strategy is one page, the roadmap one or two, the architecture a few pages plus ADRs. Detail lives in OpenSpec changes, not here.
- The roadmap is a plan, not a contract. Change it whenever a milestone teaches something; record why in the Done line.
- Never mark a user-verified criterion passed on the user's behalf.

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

**Referenced stores.** A `references:` list in the root's `config.yaml` does not move the planning root: a repo with its own root stays repo-local. Referenced stores are read-only: never branch, commit, stash, push, open a PR or write a file in one. Read them only through `openspec context --json` (each `members` entry with `role: referenced_store` gives its `path` and a `fetch` command such as `openspec show <spec-id> --type spec --store <id>`). A member whose `status` has `reference_unresolved` (the store is not registered on this machine) is named in the report as `unresolved reference: <id>` with its `fix`, and the step continues without it; never guess its path.
