# Specwright Roadmap

Strategy: [openspec/strategy.md](strategy.md) · Architecture: [openspec/architecture.md](architecture.md)

Specwright already exists (0.1.8), so M1 is not a walking skeleton: it closes the gaps between the code and the architecture baseline that most often force a manual rescue. Issue numbers refer to sh1ny/specwright. Versions follow the pre-1.0 rule in [strategy.md](strategy.md#assumptions): one minor version per feature, configuration key or workflow change, and a patch version per fix.

## Now: M1 - Hardening

**Outcome:** a change runs from branch to merged PR, including an interrupted or concurrent feedback pass, without manual git or PR rescue; subagents can load project skills.

**Exit criteria:**
- Every issue in the changes below is closed by a merged PR, and each code fix has a regression test in `evals/pr-pair` or `evals/git-workflow`. (agent)
- `evals/pr-pair` passes, and `eval-apply-three-tasks`, including its subject-length check, passes 3 runs in a row. (agent)
- In a fresh Claude Code session, `specwright-implementer` and `specwright-reviewer` list `Skill` among their tools and load a project skill. (user)
- `CONTRIBUTING.md` states the versioning rule. (agent)
- Each change ships as its own release: 0.1.9, 0.1.10 and 0.1.11. (agent)

**Changes** (in order; each about one PR):
1. `fix-agent-skills-and-subjects` (0.1.9) - #24 add `Skill` to both agent definitions, plus the restart note; #21 agents keep task commit subjects within the existing 72-character limit (the format is unchanged, so a fix); #43 the store branch check and gate lock for roadmap init/close; #44 baseline ADRs stay `proposed` until the review gate passes; the versioning rule in `CONTRIBUTING.md`.
2. `fix-pr-pair-recovery` (0.1.10) - interrupted and concurrent feedback passes: #25 rerun reactions, #26 checking the intent before writing, #29 round counting, #30 pair-link repair, #32 pass ownership, #34 repo-local recovery.
3. `fix-pr-evidence-freshness` (0.1.11) - evidence that matches the current state: #31 readiness bound to the snapshot's PR and head, #33 replies bound to the item revision they answer, #35 store git calls under the store's login, #39 watch token race.

## Next: M2 - Ship flow

A change is reviewed before it ships and can be merged by the agent when the project opts in. #27 adds the pre-ship review (0.2.0): OMP, Codex or Claude, each with its own configurable model; one brief and findings schema owned by Specwright; the reviewer runs isolated from the user's installed skills; output validated against the schema, failing closed; a spec amendment is a clarification the agent may make, or a behaviour change the user must approve. #38 makes identity fencing the default (0.3.0), which an agent merge relies on. #15 adds the opt-in agent merge mode (0.4.0). Main risk retired: review quality across harnesses. #27's first task is a trial run on each reviewer CLI. The design is recorded on #27; credits go to compound-engineering `ce-code-review` and oh-my-pi `reviewer.md`.

## Later

- M3 - Distribution: #28 versions, tags and releases; #36 a safe update lifecycle; #37 enforcing the OpenSpec pin.
- M4 - Cost tier: #22 Haiku for bounded work, evals first; #40 bounds and deadlines in the PR scripts.
- M5 - Commits and VCS backends: #20 one commit per task group, made at the group boundary only, with `Specwright-Task:` trailers; then #19 jj; GitButler as a separate change after that.
- Parked: #9 snapshot pagination beyond 100 items; revisit if large PRs become routine.

## Done
