# Proposal

## Why

Milestone **M1 - Hardening**, change 1 of 3 (release 0.1.9). Delegated agents cannot load the project's skills. Long task text produces commit subjects over the 72-character limit. Several roadmap paths stop or write in the wrong place without the user stepping in. `pr-pair.sh pass write` crashes on the minimum Python it accepts. This change advances these exit criteria: issues closed with regression tests, `eval-apply-three-tasks` passing 3 runs in a row, delegated agents listing and loading `Skill` (user-verified), and the versioning rule in `CONTRIBUTING.md`.

## What Changes

- **#24** Add `Skill` to the tools of both Claude agents (`specwright-implementer`, `specwright-reviewer`). The apply packet and review requests name the project skills that apply to the work. The OMP agents read those skills' installed `SKILL.md` files with their existing `read` tool. Both agents report a named skill they could not load. The README and CONTRIBUTING say that updated agent definitions take effect only in a new session.
- **#21** `specwright-commit` fits the task subject with a small bundled script (bash + awk, no new runtime). The script cuts the task text at the last word boundary that keeps the whole subject within 72 characters, counting backticks. It refuses when even the first word cannot fit. The message is passed by file, so task text is never interpreted by a shell.
- **#43** Store-backed roadmap **init**/**close** create their store branch under the same gate lock as `specwright-branch`, and check the store's current branch before each write and in the same call as each commit.
- **#44** Roadmap writes baseline and superseding ADRs as `Status: proposed`. It marks them `accepted`, with the date, only once the review gate passes. Immutability applies once an accepted ADR is on main. A superseding ADR written by **close** goes through the same review as the baseline.
- **#49** The baseline review follows the schema's rule: escalate after 2 consecutive REVISE rounds. A review of content edited after a passing verdict is a new round, not a breach of a lifetime cap.
- **#50** When roadmap **next** proposes a gap-closing change, it adds the roadmap entry after the branch gate has created the change's branch and commits it there by name. Main stays clean and the edit merges with the change.
- **#45** README prerequisites and the install prompt's Step 1 name `bash` (POSIX userland; Git Bash on Windows) and `git` as core requirements. `gh` 2.40+ and Python 3.8+ are listed as PR-skill requirements. A missing PR requirement is reported without blocking the install. The `specwright-pr` dependency line is corrected.
- **#46** `pass write` writes its record in a way Python 3.8 supports. The dispatcher turns any unexpected exception into the script's JSON error (`internal_error`, exit 1) instead of a traceback.
- The pre-1.0 versioning rule goes into `CONTRIBUTING.md`, and every release surface moves to 0.1.9.

## Capabilities

### New Capabilities
- `agent-delegation`: delegated implementer/reviewer agents can load and apply the project skills named for their work.
- `task-commits`: task commit subjects are built within the 72-character limit before committing.
- `project-planning`: roadmap ADR status lifecycle, baseline review rounds, and committing the gap-closing roadmap edit.
- `pr-script-runtime`: the PR scripts work on their stated minimum Python, keep the JSON error contract, and have their prerequisites stated and checked at install.

### Modified Capabilities
- `planning-stores`: the store gate lock and the per-write branch check extend to roadmap project-file branches.

## Impact

- Agents: `agents/claude/*.md`, `agents/omp/*.md`.
- Schema: `schemas/specwright/schema.yaml` (apply delegation packet and review requests name the relevant skills).
- Skills: `specwright-commit` (plus new `scripts/fit-subject.sh`), `specwright-roadmap`, `specwright-pr` (dependency line, `pr-pair.sh`). `metadata.version` changes in all six skills.
- Docs: README (prerequisites, install Step 1, restart note, version badge), CONTRIBUTING (versioning rule, restart), `openspec/architecture.md` (Design review row in Resource bounds, roadmap rows that describe the fixed behavior). Accepted ADRs are not edited.
- Tests: new unit tests for the subject script, the agent definitions and `pr-pair.sh` (internal error, Python 3.8 run). New agent evals for the roadmap store lock (#43) and the gap-closing path (#50). `eval-apply-three-tasks` re-run 3 times.
- Out of scope: #52 (where store-backed roadmap project files live and ship), PR recovery and freshness issues (M1 changes 2-3), CI automation.
