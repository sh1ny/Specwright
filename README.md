# Specwright

A lightweight spec-driven development bundle for AI coding agents, built on [OpenSpec](https://github.com/Fission-AI/OpenSpec). It keeps OpenSpec's small artifact set and adds what OpenSpec leaves out:

- **Architecture reasoning, scaled to the change.** The design step starts with a triage of six architecture triggers. A change with none gets a few lines. A change with any gets state ownership, failure visibility, resource bounds, flow gaps and a mechanism ledger, then a fresh-context (ideally cross-model) review that gates the tasks.
- **Test discipline.** Every requirement needs a failure scenario; every scenario maps to a named test that goes red → green during apply.
- **Durable decisions.** Immutable, supersedable ADRs in `docs/adr/`.
- **Git workflow.** A branch per change, one commit per task, and a finish step that either merges locally or goes through a GitHub PR.
- **PR tooling.** Ship a PR with a useful description, resolve review feedback, and watch CI and reviews in the background - with two small scripts instead of dozens of tool calls.
- **Cheap delegation.** The main agent plans and verifies; a cheaper implementer model does the tasks.
- **Project planning.** A big idea becomes a one-page strategy, an architecture baseline with foundational ADRs, and a milestone roadmap; each milestone is a handful of OpenSpec changes.

```
proposal → specs → design (LIGHT | FULL) → review → tasks → apply → archive
                                                      │                │
                  specwright-branch ──────────────────┘ specwright-commit  specwright-finish
                                                                 └── specwright-pr (ship / feedback / watch)
```

## Contents

| Path | What |
|---|---|
| `schemas/specwright/` | OpenSpec custom schema (forked from `spec-driven`, OpenSpec 1.14.1) |
| `skills/specwright-branch` | Gate before a new change: on main, clean tree, create `<prefix>/<change>` |
| `skills/specwright-commit` | Apply phase: one commit per task, end-of-apply verification |
| `skills/specwright-finish` | After archive: local `--no-ff` merge, or push to the PR |
| `skills/specwright-pr` | PR `ship` / `feedback` / `watch`, with `as.sh`, `pr-snapshot.sh`, `pr-reply.sh` |
| `skills/specwright-debug` | Root-cause debugging, including a CI-failure mode |
| `skills/specwright-roadmap` | Project level: `init` (idea → strategy, architecture, roadmap), `next`, `close`, `status` |
| `agents/claude/`, `agents/omp/` | `specwright-implementer` (cheap model) and `specwright-reviewer` (fresh context) |
| `openspec/config.yaml` | The context lines that make the skills fire |
| `openspec/specwright.yaml` | Settings: finish mode, GitHub identity, review request, pre-push validation |

## Install / update

> **Prerequisites:** the OpenSpec CLI (`npm i -g @fission-ai/openspec`), `openspec init` run in the project, `git`, and `gh` (for the PR skills). The PR scripts need `bash` (Git Bash on Windows).

Paste this into your coding agent. The same prompt installs and updates.

```text
Install/Update Specwright

Install or update Specwright from https://github.com/sh1ny/Specwright into the
current project. Follow the steps in order. Ask the user where indicated - do
not assume answers.

Step 1 - Check prerequisites
- Run `openspec --version`. If it fails, tell the user to install it
  (`npm i -g @fission-ai/openspec`) and STOP.
- If there is no `openspec/` directory, tell the user to run `openspec init`
  first and STOP.

Step 2 - Choose targets
Ask which agents this project uses (several may apply) and confirm the paths:
- Claude Code: skills → `.claude/skills/`, agents → `.claude/agents/`
- OMP: skills → `.claude/skills/` (OMP reads it), agents → `.omp/agents/`
- Codex: skills → `.agents/skills/`
- Other: ask for the skills directory.

Step 3 - Download
Clone https://github.com/sh1ny/Specwright to a temporary directory
(`git clone --depth 1`, or any other method that works).

Step 4 - Install files (overwrite existing copies; track new vs updated)
- Copy each `skills/specwright-*` directory, recursively, into every chosen
  skills directory.
- Copy `agents/claude/*.md` into `.claude/agents/` if Claude Code was chosen,
  and `agents/omp/*.md` into `.omp/agents/` if OMP was chosen.
- Replace `openspec/schemas/specwright/` with the downloaded
  `schemas/specwright/`.
- Copy `VERSION` to `openspec/.specwright/VERSION`.
- Legacy openspec-git-flow: if `openspec-git-branch`, `openspec-git-commit` or
  `openspec-git-merge` skill directories exist in a chosen skills directory,
  or `openspec/.git-flow/` exists, tell the user and remove them.

Step 5 - Merge openspec/config.yaml (never remove unrelated content)
- If it does not exist, copy the downloaded `openspec/config.yaml`.
- Otherwise:
  - `schema:` - if it is missing or `spec-driven`, set it to `specwright`. If
    it names another schema, ask the user before changing it.
  - `context:` - append each line from the downloaded config's context that
    is not already present. Remove any line naming `openspec-git-branch`,
    `openspec-git-commit` or `openspec-git-merge`.

Step 6 - Settings (openspec/specwright.yaml)
- If it does not exist, copy the downloaded file, then ask the user for:
  finish mode (`local` merges to main locally; `pr` goes through GitHub PRs),
  the GitHub login for pushes/PRs/replies, an optional review-request comment
  and the login that posts it, and an optional pre-push validation command.
  If the project already has strategy, architecture or roadmap documents
  (e.g. STRATEGY.md, docs/architecture*, a roadmap or milestone plan), ask
  whether to point the `project:` paths at them instead of the defaults.
  Write their answers into the file.
- If it exists, keep the user's values and add only keys that are missing,
  with the downloaded defaults.

Step 7 - Verify and clean up
- Run `openspec schema validate specwright`; report any error.
- Delete the temporary directory.

Step 8 - Report briefly: directories used, skills and agents installed (new
vs updated), config and settings created/merged/unchanged, legacy files
removed, and the VERSION. Tell the user to restart their agent so new skills
and agents load.
```

## Using it

**A whole project, not one change:** give the idea to `specwright-roadmap` **init**. It asks a couple of rounds of questions, then writes a one-page strategy, an architecture baseline (system-level triage, component and ownership tables, foundational ADRs, reviewed cross-model) and a roadmap whose first milestone is a walking skeleton. Only the current milestone is split into changes. Then `next` starts each change, and `close` checks the milestone's exit criteria and plans the next one. Existing strategy or architecture documents can be adopted by pointing `project:` in `openspec/specwright.yaml` at them.

**Each change:**

1. Start a change: `/opsx:propose <idea>` (or `/opsx:new`). `specwright-branch` checks you are on a clean main and creates the branch.
2. Write the artifacts (`/opsx:continue` or `/opsx:ff`). The design's triage picks LIGHT or FULL; FULL designs get reviewed by a different model (`codex` ↔ `claude`) or the `specwright-reviewer` agent, and tasks are blocked until the verdict passes.
3. `/opsx:apply`. The main agent hands task groups to `specwright-implementer`, re-verifies each one, and commits per task.
4. In `pr` mode, the PR is opened when apply finishes; `watch` handles reviews and CI. Archive once it's green, then merge on GitHub.
5. `/opsx:archive`. `specwright-finish` merges locally or pushes the archive commit to the PR.

### Model routing

- **Claude Code:** `specwright-implementer` runs on `sonnet`; `specwright-reviewer` inherits the main model. Edit `model:` in `.claude/agents/*.md` to change it.
- **OMP:** the agents use role aliases - `pi/smol` for the implementer, `pi/slow` for the reviewer. Map those roles to models in `~/.omp/agent/config.yml`.

## Uninstall

Delete the `specwright-*` skill directories, the two `specwright-*` agent files, `openspec/schemas/specwright/`, `openspec/.specwright/` and `openspec/specwright.yaml`. Remove the Specwright lines from `openspec/config.yaml` and set `schema:` back to `spec-driven`. Restart your agent.

## Credits

The schema is forked from OpenSpec's `spec-driven` schema (MIT). Ideas are adapted from [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin) (planning and PR workflow), the [anvil](https://github.com/jikkujoyce/openspec-schemas) schema (review gate, test plan) and [intent-driven](https://github.com/intent-driven-dev/openspec-schemas) (ADRs). The git workflow comes from [openspec-git-flow](https://github.com/sh1ny/openspec-git-flow).
