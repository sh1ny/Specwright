---
name: specwright-roadmap
description: "Project-level planning above OpenSpec changes: strategy, architecture baseline (foundational ADRs) and a milestone roadmap. Modes: init (turn a big project idea or brief into strategy, architecture and roadmap), next (start the next change of the current milestone), close (verify a milestone's exit criteria and plan the next one), status. Triggers: a project idea too big for one change, 'plan this project', 'create a roadmap', 'what's next on the roadmap', 'next change/milestone', 'close the milestone', 'roadmap status', or specwright-finish offering next/close."
metadata:
  version: 0.1.1
---

# Specwright Roadmap

Three project files sit above OpenSpec changes. Paths come from `project:` in `openspec/specwright.yaml`; defaults are below. Templates are in this skill's `references/`.

| File | Default | Holds | Changes |
|---|---|---|---|
| Strategy | `openspec/strategy.md` | Purpose, users, boundaries, metrics | Rarely |
| Architecture | `openspec/architecture.md` | System shape + index of in-force ADRs (`docs/adr/`) | When an ADR is added or superseded |
| Roadmap | `openspec/roadmap.md` | Milestones: outcome, exit criteria, changes | At every milestone close |

Status is derived, never stored: a change is done when `openspec/changes/archive/` holds it; a milestone is done when all its changes are done and its exit criteria pass.

## init

Input: the user's project idea (any size), plus the repo if code exists.

1. **Adopt before writing.** If strategy, architecture or planning documents already exist, point the `project:` settings at them or extract from them; do not rewrite what is there.
2. **Interview, briefly.** List the gaps that would change the architecture or the first milestone: users, platform, scope and non-goals, hard constraints, data and its sensitivity, success measures. Ask them in at most two batched rounds, each question with a recommended default. Everything else becomes a stated assumption.
3. **Strategy** (`references/strategy.md`), one page.
4. **Architecture baseline** (`references/architecture.md`). Run the design triage (T1-T6 from the schema's design instruction) for the whole system, not one change. Write the component diagram, state ownership, boundaries and contracts, resource bounds and failure visibility at system level - brief, a few lines per row. Record the foundational decisions as ADRs (process and isolate model, storage and formats, IPC and contracts, state management, external integrations), each with a rejected alternative and its reversal cost. Ground in the code if it exists; otherwise check claims about the stack against its docs.
5. **Review** the strategy and architecture the same way a FULL design is reviewed (cross-model CLI unless `review.cross_model` is `false`, else the `specwright-reviewer` agent), into `openspec/architecture-review.md`, at most two rounds. This is the one place a review always runs: early architecture mistakes are the most expensive ones.
6. **Roadmap** (`references/roadmap.md`):
   - M1 is a walking skeleton: the thinnest end-to-end slice through the architecture, which proves the riskiest assumptions first.
   - Each milestone has a demoable outcome and exit criteria that can be checked, each marked agent- or user-verified.
   - Only the current milestone is split into changes (2-6, each about one PR). Next gets a paragraph, Later one line each.
7. Commit on a branch (`docs/project-baseline`) and finish per the `finish` setting. Then offer **next**.

## next

1. Read the roadmap's Now section. Run `openspec list --json` and list `openspec/changes/archive/` to see which changes are active or done.
2. Active change in progress → offer to resume it instead.
3. Otherwise pick the first planned change that is not done and whose prerequisites are done. If none is left but exit criteria still fail, propose a new change that closes the gap and add it to the roadmap.
4. Start `/opsx:propose <change-name>` (`specwright-branch` runs first). Give the proposal its context: the milestone, the exit criteria this change serves, and the ADRs that constrain it. The proposal names its milestone.

## close

1. Every change of the milestone archived? If not, list what is left and stop.
2. Walk the exit criteria. Run agent-verifiable checks yourself. Ask the user to run user-verified ones and record their results; anything skipped is recorded as unverified, never passed.
3. Any criterion fails → propose the change that fixes it (via **next**); do not close.
4. Close: move the milestone to Done with the date and one line on what was learned.
5. Re-plan with what the milestone taught: promote Next to Now and split it into changes; revise Later. If an architecture assumption broke, write a superseding ADR and update the architecture index - never edit an accepted ADR.
6. Commit like init (branch `docs/close-<milestone>`).

## status

One answer, no edits: current milestone, its changes (done / active / planned, derived as above), exit criteria state, and what **next** would start.

## Rules

- Keep it small: the strategy is one page, the roadmap one or two, the architecture a few pages plus ADRs. Detail lives in OpenSpec changes, not here.
- The roadmap is a plan, not a contract. Change it whenever a milestone teaches something; record why in the Done line.
- Never mark a user-verified criterion passed on the user's behalf.
