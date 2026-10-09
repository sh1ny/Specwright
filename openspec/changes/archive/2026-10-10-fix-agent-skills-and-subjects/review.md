# Review

## Metadata

- **Round:** 1
- **Prior round:** none
- **Reviewer:** fresh-context subagent (Claude Code, `specwright-reviewer` role)
- **Reviewed:** proposal.md, design.md, specs/{agent-delegation,task-commits,project-planning,planning-stores,pr-script-runtime}/spec.md; openspec/roadmap.md (M1), openspec/architecture.md (state ownership, boundaries, resource bounds); ADRs 0002, 0003, 0005, 0006; agents/claude/specwright-{implementer,reviewer}.md, agents/omp/specwright-{implementer,reviewer}.md; schemas/specwright/schema.yaml (review instruction :295-347, apply DELEGATION :425-440); skills/specwright-commit/SKILL.md, skills/specwright-roadmap/SKILL.md, skills/specwright-branch/SKILL.md, skills/specwright-pr/SKILL.md, skills/specwright-pr/scripts/pr-pair.sh (header, :35-39, :897, :925-933, :1210-1222, emit :79-82); README.md (prerequisites :42, install Step 1 :54-70, Step 8 :157-164, manual install); CONTRIBUTING.md (Setup, Testing, Releases); evals/git-workflow/grade.py (eval-apply-three-tasks); GitHub issues #24, #21, #43, #44, #49, #50, #45, #46, #52.

<!-- This verdict covers only the contents reviewed. Editing proposal, specs or design afterward (other than applying Required Changes) voids it. -->

## Findings

Scope check: the plan is lean. One new script (`fit-subject.sh`, bash + awk), a one-line Python fix plus a catch-all, and prose edits to existing skills. The two new agent evals (#43 lock held, #50 gap path) are required by CONTRIBUTING Testing ("add a case when the change adds a stop condition or branch-state rule"). I found no over-engineering finding. I also checked that `pr-pair.sh` uses no other 3.9+/3.10+ API: the only `newline=` on a `Path` method is `:932`, and `:610` uses `NamedTemporaryFile`, which accepts it on 3.8. So D7 as written is enough for 3.8.

### Critical (blocking)

None.

### Moderate

**M1. Accepting the ADRs voids the verdict that allowed the acceptance (D4 vs D5, project-planning spec).**
D4: once the baseline review passes, the orchestrator "sets `Status: accepted` with that date, adds them to the in-force index". That edits every ADR file and `architecture.md` after the pass. D5 and the spec requirement "Baseline review rounds follow the schema's escalation rule" say "any later edit to the strategy, architecture or ADRs voids it and SHALL get a new review round before the gate counts as passed". Read literally, every init forces an extra review round over content whose only change is the acceptance, and an agent may loop or ask the user. The same applies to close's superseding ADR and its index row. Consequence: init and close cannot reach the roadmap step without either an unneeded extra round or the agent ignoring a SHALL. Fix: exempt the acceptance edit explicitly (see Required Change 1).

**M2. `allowed-tools: Bash(bash *)` pre-approves any shell command while `specwright-commit` is active (D2).**
`specwright-commit` currently pre-approves only `Bash(git *) Bash(openspec *)` (`skills/specwright-commit/SKILL.md:7`). `Bash(bash *)` also matches `bash -c '<anything>'`, so during apply every arbitrary command runs without a permission prompt. That contradicts T6, which this change triggers precisely because task text can carry shell syntax. Fix: narrow the rule to the script, or leave `allowed-tools` unchanged and accept one prompt per task (Required Change 2).

**M3. With `Skill` in its tools, the implementer can auto-invoke Specwright's own MANDATORY workflow skills (D1, agent-delegation spec).**
With `Skill` in `tools`, a Claude subagent sees every installed skill's description, not only the ones the packet names. `specwright-commit`'s description reads "MANDATORY during the OpenSpec apply phase ... Commits each completed task", and the implementer is dispatched during apply. Invoking it would pre-approve `Bash(git *)` (its `allowed-tools`) and tell the agent to commit, which breaks ADR 0005 ("It never commits or ticks") and the orchestrator's one-commit-per-task split checked by `eval-apply-three-tasks`. `specwright-branch` and `specwright-finish` carry the same risk. D1's guard ("nothing a skill says changes who verifies, ticks or commits") is one line of prose, and the spec has no scenario for an un-named skill being triggered by its description. Fix: Required Change 3.

**M4. OMP agents can load only skills installed under the code checkout's `.claude/skills/` (D1).**
D1 tells OMP agents to `read` `.claude/skills/<name>/SKILL.md` in the code checkout. #24 says that path-based reading "fails for user-level skills stored outside the repo", and its motivating example (Dart/Flutter skills) is of that kind. Under D1, every user-level or plugin skill named in an OMP packet is reported "not loaded", so #24 stays open for OMP. The orchestrator knows where each skill lives (its harness lists them), so the packet can carry the path. Fix: Required Change 4.

**M5. The #46 regression test will always skip on the maintainer's machine.**
The ledger accepts "Python 3.8 test via a real 3.8 interpreter, skipped when none found", and the pr-script-runtime spec makes the skip a scenario. On this machine `py -0` lists only 3.10-3.13 (uv-managed), with no 3.8. So the test that is meant to close #46 never runs here, and the M1 exit criterion "each code fix has a regression test" is met in name only. A future `write_text(newline=)` or `read_text(newline=)` would pass the suite again. Fix: Required Change 5. It adds no dependency.

### Suggestions

**S1. CONTRIBUTING contradicts D8 after the change.** Setup step 1 lists `git`, `gh` and `bash` but not Python 3.8+, which the evals and `pr-pair.sh` need. Testing says PR scripts should "keep them `bash` + `gh` only" (`CONTRIBUTING.md:43`), but `pr-pair.sh` is Python. CONTRIBUTING is already in the Impact list (for the versioning rule), so update both lines in the same edit.

**S2. Roadmap wording for #50 differs from D6.** `openspec/roadmap.md` M1 change 1 says "#50 roadmap **next** commits its gap-closing roadmap edit before the branch gate". D6 deliberately commits it after the gate, on the change branch, and that is the better choice: it adds no extra branch or PR. Note the deviation in proposal.md so that **close**, which checks the roadmap's listed issues against what shipped, does not read it as a gap.

**S3. D3 cites `specwright-branch` store steps by number ("1, 2 and 4").** Store step 2 runs code-change checks (the "used once" archive check, change-directory carry-over, "exists in only one repo") that have no meaning for a store-only `docs/...` branch (#52 confirms roadmap branches only the store). In the roadmap skill, write out the subset D3 already names in parentheses (lock, store clean on its main, not busy, branch absent, create, release) rather than step numbers, so a later renumbering of the branch skill cannot silently change roadmap's gate.

## Verdict

VERDICT: APPROVE_WITH_CHANGES

## Required Changes

1. **design.md D4 and D5, and specs/project-planning/spec.md, requirement "Baseline review rounds follow the schema's escalation rule":** add the following, or equivalent: "The acceptance edit (changing a reviewed ADR's `Status: proposed` to `accepted` with its date, and adding that ADR's row to the in-force index) is part of passing the gate and does not void the verdict. Any other edit does." Add one THEN to the scenario "Baseline passes review" stating that no further review round runs after the acceptance edit.
2. **design.md D2 (and Impact in proposal.md if it mentions it):** replace `allowed-tools` adds `Bash(bash *)` with either a rule scoped to the script path (for example `Bash(bash *fit-subject.sh *)`, if the harness's matcher supports it; verify against the current Claude Code permission-rule docs) or "allowed-tools unchanged; the script call is prompted like other non-git commands".
3. **design.md D1 and specs/agent-delegation/spec.md:** state in the agent bodies that the agent loads only the skills its packet or request names and never invokes Specwright workflow skills (`specwright-*`). Add a scenario: WHEN an implementer dispatched during apply has `Skill` and the packet names no `specwright-*` skill, THEN it invokes no `specwright-*` skill and makes no commit.
4. **design.md D1, specs/agent-delegation/spec.md and schema DELEGATION text:** each named skill in the packet or request carries the path of its installed `SKILL.md` as the orchestrator resolved it. The OMP agents read that path, not a fixed `.claude/skills/<name>/SKILL.md`. Amend the scenario "OMP reviewer loads a named skill" to use the given path.
5. **design.md Mechanism Ledger and specs/pr-script-runtime/spec.md:** add an always-run check to the `pr-pair.sh` tests that the embedded Python passes no `newline=` argument to `write_text`/`read_text` (a source scan, no new dependency). Keep the real-3.8 run as the skippable second layer. Add the always-run check as a THEN to the "No Python 3.8 available to the test" scenario.

CHANGES_APPLIED: yes

## Rebuttals

Re-check of Required Changes 1-5 (reviewer, new run; only these items re-checked; `openspec validate fix-agent-skills-and-subjects --strict` passes):

1. Applied. D4 now holds the acceptance-edit exemption; D5 says "except the acceptance edit defined in D4". The project-planning requirement text has the exemption, and "Baseline passes review" adds "no further review round runs because of the acceptance edit".
2. Applied. D2 leaves `allowed-tools` unchanged, and the script call is prompted. The proposal never mentioned `Bash(bash *)`.
3. Applied. The D1 bullets say to load only named skills and never invoke a `specwright-*` skill. The agent-delegation requirement states the same, and the new scenario "Workflow skills stay with the orchestrator" covers it.
4. Applied. In D1, the packet or request carries each skill's resolved `SKILL.md` path (project or user level), and OMP reads that path. The requirement and the amended OMP scenario use a user-level path. The schema DELEGATION text is source and changes during apply; D1 is binding for it.
5. Applied. The Mechanism Ledger has the always-run source-check row, and the "No Python 3.8 available to the test" THEN requires it.
