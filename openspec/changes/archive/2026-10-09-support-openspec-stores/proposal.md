# Proposal

## Why

OpenSpec 1.14 added stores: planning (specs and changes) kept in a separate git repo and shared between repos and teams. Specwright assumes the planning files sit in the same git repo as the code, so it only partly works with stores:
- `specwright-commit` stops when `planningHome.root` is outside the repo.
- `specwright-finish` and `specwright-pr` stage `openspec/...` paths that are not in the code repo.
- `specwright-roadmap` looks for archived changes in the code repo's history, so a change archived in a store never counts as done.
- The installer writes the schema and the mandatory skill triggers into the code repo's `openspec/`, which a store-backed project does not read.

Teams that adopt stores therefore lose Specwright's git workflow, or cannot use Specwright at all. There is no roadmap in this repo, so this change serves no milestone.

## What Changes

- **Root resolution:** each Specwright skill reads the planning root from OpenSpec (`root.path` from `openspec list --json`, which still works after archive) instead of assuming `./openspec/`, and treats a root in a different git repository as a store. A root in another worktree of the code repo stops before any write. This covers a `--store` flag, a project `store:` pointer and a global `defaultStore`. Store-side git and `gh` commands run inside the store's checkout, so the identity wrapper still fences pushes, and root-less OpenSpec commands (`templates`, `schema validate`) run at the resolved root.
- **specwright-branch:** when the change lives in a store, the gate also checks that the store's working tree is clean and on its main branch, and creates the same `<prefix>/<change-name>` branch there. OpenSpec allows one checkout per store on a machine, so changes against one store are serialized: a short gate lock in the store's git directory stops two sessions from starting at once, and a busy store stops the gate.
- **specwright-commit:** commits planning artifacts and drift amendments to the store, on the store branch. Each task gets a code commit and a matching store commit for its tick, and an unpaired task is reconciled before any new work. The "Specwright does not commit planning stores" stop is removed.
- **specwright-finish:** makes the archive commit in the store. Finishing follows `finish` in both repos: `local` merges the store branch and then the code branch, and `pr` hands both off to `specwright-pr`. A planning-only change (no code commits) finishes in the store alone and gets a `specwright-change.yaml` marker (`code_changes: none`) in its archived directory. After the PRs merge, cleanup runs per merged PR and leaves any unmerged branch in place.
- **specwright-pr:** works on an expected PR set: a code PR once one exists or the code branch has commits, a store PR when the store has a GitHub `origin`. When both are expected, each links the other, in its description when the other's URL is known at creation and otherwise by one marker comment, so existing descriptions are never rewritten. Watch waits on every expected PR and hands off when one merges or closes alone. Feedback routes fixes by path and counts rounds across both PRs (`Feedback-Round:` trailer, which repo-local fix commits also gain), and a pass record of what a pass intends lets an interrupted pass be completed under its own round, reading progress from git and GitHub, before the round limit applies. A PR belongs to the change only when its head is the change branch in the repo Specwright pushes to, read from each checkout's `origin` and passed explicitly to every `gh` call. Link comments name the peer PR and are updated when it is replaced, and an existing PR into a branch other than main stops ship. Archive-before-merge archives in the store. The store's identity, validation and reviewers are set only where they differ from the code repo's.
- **specwright-roadmap:** counts a store-backed change as done only when the store's main has its archive and either the archive holds the planning-only marker or the code side merged as a whole (`merge: <change-name>` on code main's first-parent history in local mode, a code PR MERGED into code main in pr mode). Otherwise it reports "planning merged, code pending".
- **References mode:** a repo that keeps its own `openspec/` and lists a store under `references:` keeps working as it does today. Specwright does not commit to or open PRs on referenced stores, and review/design steps may read referenced specs as read-only context.
- **Install/update:** the install prompt installs the schema and the `config.yaml` skill-trigger `context:` under the resolved root (the store, when there is one) and validates them from there. `specwright.yaml` stays in the code repo.
- **Docs and evals:** README gets a stores section (including that one store holds one change in progress at a time on a machine), and the git-workflow evals get two-repo fixtures that isolate OpenSpec's registry, global config and watch state.

There are no **BREAKING** changes: projects with a repo-local `openspec/` keep their branches, commit subjects and finish behavior. The one visible difference is the `Feedback-Round:` trailer on feedback fix commits.

## Capabilities

### New Capabilities
- `planning-stores`: how Specwright finds the planning root and carries out its git workflow (branch, planning and archive commits, finish, PRs, roadmap status) when changes and specs live in an OpenSpec store rather than the code repo, and how it treats read-only `references:` stores.

### Modified Capabilities
<!-- None: openspec/specs/ has no capabilities yet. -->

## Impact

- **Skills:** `specwright-branch`, `specwright-commit`, `specwright-finish`, `specwright-pr` (SKILL.md plus `scripts/pr-snapshot.sh` and the description reference), `specwright-roadmap`. Their `metadata.version` values go up.
- **Schema:** `schemas/specwright/schema.yaml` keeps its store-aware `planningHome.root` guidance. Any wording that still assumes repo-local paths is reviewed.
- **Agents:** `agents/claude` and `agents/omp`. The reviewer and implementer resolve the planning root the same way.
- **Install:** the README install/update prompt, plus `templates/openspec/config.yaml` and `specwright.yaml`, which may need a store setting.
- **Evals:** `evals/git-workflow` fixtures and grading for a two-repo (code plus store) setup.
- **Dependencies:** OpenSpec ≥ 1.14 store support, which is beta and whose flags may change. Two git repos are touched per change, and `gh` operations may target a second GitHub repository.
