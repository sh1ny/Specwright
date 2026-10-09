# Specwright Architecture

Specwright is not a running service. It is text and small scripts that an AI agent loads and follows inside a user's project. "Components" below are therefore instruction packages, scripts and the external tools they drive. The agent is the only process that runs them.

## System triage

- **T1 Components:** applies. There are six skills, two agents, a schema, four PR scripts and an install prompt, with directed calls between them (see Components).
- **T2 State:** applies. Change artifacts, `tasks.md` ticks, commit trailers, PR reply markers, the feedback pass record and the store gate lock are all persistent state.
- **T3 Concurrency:** applies. Several agents share one machine, one `gh` login store and one planning store. `watch` polls in the background, and reviewers answer asynchronously.
- **T4 Boundaries:** applies. The schema is OpenSpec's extension point; `specwright.yaml` is a shared, versioned settings format; commit subjects, trailers and PR markers are formats that later runs parse; GitHub and the model CLIs are external systems.
- **T5 Volume:** applies. PR threads, comments and checks grow without a fixed bound, and so does commit history per change.
- **T6 Risk:** applies. The scripts push and comment under a GitHub identity, and cross-model review sends code to another provider.

## Components

```mermaid
flowchart LR
  subgraph Host["Host agent: Claude Code / Codex / OMP"]
    O[Orchestrating agent]
  end
  O -->|follows| SCH[schemas/specwright<br/>artifact instructions]
  O -->|follows| BR[specwright-branch]
  O -->|follows| CM[specwright-commit]
  O -->|follows| FI[specwright-finish]
  O -->|follows| PRS[specwright-pr]
  O -->|follows| RM[specwright-roadmap]
  O -->|follows| DBG[specwright-debug]
  O -->|dispatches packet| IMP[specwright-implementer agent]
  O -->|dispatches paths| REV[specwright-reviewer agent]
  O -->|shell, read-only| XM[Cross-model CLI<br/>codex / claude]
  CM & FI & RM -->|pr mode: ship| PRS
  PRS -->|archive before merge| FI
  PRS -->|CI failure| DBG
  RM -->|baseline review| XM & REV
  PRS --> SNAP[pr-snapshot.sh]
  PRS --> PAIR[pr-pair.sh]
  PRS --> REPLY[pr-reply.sh]
  PRS & SNAP & PAIR & REPLY --> AS[as.sh identity fence]
  FI & RM -->|PR lookup| AS
  AS --> GH[(GitHub via gh)]
  AS -->|fenced push| GIT & STORE
  BR & CM & FI & RM & PRS & PAIR -->|local git; fetch, pull| GIT[(git: code repo)]
  BR & CM & FI & RM & PRS & PAIR -->|local git; fetch, pull| STORE[(git: planning store, optional)]
  DBG -->|read-only history| GIT
  SCH & BR & CM & FI & PRS & RM & IMP & REV --> OS[OpenSpec CLI]
  FI -->|offers next / close| RM
  RM -->|next: /opsx:propose| BR
  INST[README install prompt] -->|copies| Host
```

| Component | Responsibility | Owns (state) | Talks to via (contract) |
|---|---|---|---|
| `schemas/specwright` | Artifact sequence (proposal, specs, design with triage, review gate, tasks) and apply instructions | Artifact templates | OpenSpec schema format (`openspec schema validate`) |
| `specwright-branch` | Clean-main gate, `<prefix>/<change-name>` branch, store branch and gate lock | Store gate lock | git in the code repo and the store; `openspec list --json` |
| `specwright-commit` | One commit per task, Reconcile, completion check | Task commits and their subjects/trailers | git in the code repo and the store; `openspec list --json`; `tasks.md`; `specwright-pr` ship in pr mode |
| `specwright-finish` | Archive commit, local `--no-ff` merge or hand-off to the PR | Archive commit, merge commit, planning-only marker | git in the code repo and the store; OpenSpec archive; `gh` through `as.sh` for the code PR lookup (plain `gh` after merge, #38); `specwright-pr` ship in pr mode |
| `specwright-pr` + scripts | Ship, feedback and watch for one PR or a code/store PR pair | Feedback pass record, PR reply markers | `gh` GraphQL/REST through `as.sh`; `git` in the code repo and store (push; `pr-pair.sh`); `openspec list --json`; JSON on stdout; `specwright-finish` (archive before merge) and `specwright-debug` (CI failures) |
| `specwright-roadmap` | Strategy, architecture baseline, milestones | `openspec/strategy.md`, `roadmap.md`; the baseline `architecture.md` and ADRs (see State ownership) | git and the store for its own branch and commits; `gh` through `as.sh` for PR status; OpenSpec CLI (`list`, `templates`, `schema validate`, `context`); `specwright-pr` ship in pr mode |
| `specwright-debug` | Root-cause debugging discipline | None | git, read-only (`status`, `log`), plus `stash` to test a dirty tree, restored after; returns a verified fix uncommitted to `specwright-pr` in CI mode |
| `specwright-implementer` agent | Implements one task group test-first from a packet | Nothing committed: the orchestrator verifies, ticks and commits | Packet in, evidence report out; OpenSpec CLI (`list`, `templates`, `schema validate`) |
| `specwright-reviewer` agent | Fresh-context review when no cross-model CLI is used | The one review file it is asked to write (`review.md` or `architecture-review.md`) | File paths in; the review file out, with exactly one `VERDICT:` line; OpenSpec CLI (`list`, `context`, `instructions`, `templates`) |
| Install prompt (README) | Installs or updates the copies into a project; keeps local `model:` lines | `openspec/.specwright/VERSION` | Copy layout in `CONTRIBUTING.md` |
| Evals (`evals/`) | Graded agent runs and script tests, with a fake `gh` | Fixtures | `evals.json` + `grade.py`; `unittest` (`python -m unittest discover evals/pr-pair`) |

## State ownership

| State | Sole writer | Lifetime | Invalidation / rebuild | Authoritative copy |
|---|---|---|---|---|
| Change artifacts (`openspec/changes/<name>/`) except `review.md` | Orchestrating agent, through the schema | Until archive | Drift rule: separate `amend <artifact>` commit | Planning repo branch, then main |
| `review.md` | One writer per review, by path: the orchestrator for LIGHT (`SKIPPED_LIGHT`) and for a cross-model review (saves the CLI output verbatim); `specwright-reviewer` for a fresh-context review; the orchestrator also records `USER_OVERRIDE` after escalation | Until archive | A new review round rewrites it | Planning repo branch, then main |
| `tasks.md` ticks | Orchestrator (never the implementer) | Until archive | Reconcile against commits | Planning repo (store when store-backed) |
| Task commits (`task X.Y` subject, `Code-Changes: none`) | `specwright-commit` | Permanent | Never rewritten without the user | Change branch, then main |
| Archive and merge commits (`archive change`, `merge: <change>`) | `specwright-finish`; `merge: <branch>` also from `specwright-roadmap` in local mode | Permanent | Never rewritten; roadmap status reads them | Planning repo (archive); main of each merged repo, store and code (merge) |
| Planning-only marker (`specwright-change.yaml`, `code_changes: none`, in the archive directory) | `specwright-finish` writes it at archive; `specwright-pr` feedback deletes it when a code fix follows | Permanent once on the store's main | Proof for roadmap status that a store-backed change has no code side | Store branch, then the store's main |
| `Feedback-Round: <n>` trailers | `specwright-pr` feedback | Permanent | The round count is derived from them | Change branch in either repo |
| PR markers: reply markers (`specwright:handled <id>`, with a trailing `resolve` when the thread is to be resolved; `specwright:waiting`), pair-link comments (`specwright:link`), `specwright:pr-item` in after-limit issue bodies | `pr-reply.sh`; `pr-pair.sh link`; `specwright-pr` after the limit | Life of the PR | An item edited after the reply counts as unhandled again. Gap: an edit made while the fix was in progress is hidden by the later reply (#33) | GitHub |
| Feedback pass record (store-backed changes only) | The one session running feedback for the change, through `pr-pair.sh pass write/done`. Gap: that exclusivity is assumed, not enforced (#32) | One feedback pass | Deleted at `pass done`; a leftover record blocks the next pass until resumed | `~/.cache/specwright/feedback/` (or `SPECWRIGHT_STATE_DIR`) |
| Watch ownership token | The newest `pr-snapshot.sh --wait` on the PR | One watch | Released on exit; an older watcher that sees another token exits 4. Gap: cleanup can delete a newer watcher's token, leaving no watcher (#39) | `~/.cache/specwright/watch/<owner>-<repo>-<pr>` (or under `SPECWRIGHT_STATE_DIR`) |
| Store gate lock | `specwright-branch` | The gate only | Never auto-removed; the user confirms removal | `<store git-common-dir>/specwright-gate.lock` |
| Strategy and roadmap (`strategy.md`, `roadmap.md`) | `specwright-roadmap` init/close, and **next** when it adds a gap-closing change | Project lifetime | The roadmap is updated at each milestone close; status is derived, never stored | Main of the planning repo |
| Baseline review (`architecture-review.md`) | One writer per round, by path: the orchestrator saves a cross-model CLI's output verbatim; `specwright-reviewer` writes it on the fresh-context path; the orchestrator also records `USER_OVERRIDE` after escalation | Project lifetime | A new review round rewrites it | Main of the planning repo |
| Architecture file and ADRs (`architecture.md`, `docs/adr/`) | One writer at a time, by path: `specwright-roadmap` init/close, or the apply task of a change whose reviewed design records an ADR (it also updates the index) | Project lifetime | An ADR is `Status: proposed` and editable until its review gate passes; it is then marked `accepted` and never edited again: a new ADR supersedes it and the index is updated. Gap: roadmap writes baseline ADRs as `accepted` before its review runs (#44) | Main of the repo holding them (`project.architecture`, `project.adr_dir`) |
| Settings | The user (install prompt merges; `specwright-roadmap` init may set the `project:` paths) | Project lifetime | Install keeps local values | `openspec/specwright.yaml`, `openspec/config.yaml` |
| Installed version | Install prompt, last step | Until next install | Rewritten on install | `openspec/.specwright/VERSION` |

## Boundaries and contracts

- **OpenSpec:** only through the custom schema and the CLI (`list`, `show`, `new change`, `instructions`, `templates`, `schema validate`, `validate`, `archive`, `context --json`). The OpenSpec version is pinned in the README badge and `CONTRIBUTING.md`, but not enforced at install (#37).
- **Settings:** `specwright.yaml` keys are documented in `templates/openspec/specwright.yaml` and the README. A new key has a safe default, so a missing key keeps earlier behaviour.
- **Git evidence formats:** commit subjects `<type>(<change>): task X.Y …`, trailers `Feedback-Round:` and `Code-Changes: none`, the legacy `address review feedback` subject (counted as a round on a branch without trailers), archive/merge subjects, and the planning-only marker. Later runs and roadmap status parse these, so changing them is a workflow change (minor version).
- **Script I/O** (ADR 0002): `pr-snapshot.sh` and `pr-pair.sh` print one JSON document (`pr-snapshot.sh --logs` appends plain log text); `pr-reply.sh` prints one plain line per action. Exit codes signal stop conditions. Scripts use only `bash` with a POSIX userland (`sed`, `grep`, `mktemp` and similar; Git Bash on Windows), `git`, `gh` 2.40+ (built-in jq) and the Python standard library (`pr-pair.sh` accepts 3.8+, but `pass write` needs 3.10+ and fails with a traceback, not JSON, on older versions: #46); `pr-pair.sh` runs `git` in the code repo and the store for repo identity, the expected PR set, recovery and cleanup.
- **GitHub identity** (ADR 0004): every `gh` call for a configured login goes through `as.sh <login>` (or, for `pr-pair.sh`'s reads of the store under `planning_store.login`, its internal fence that resolves and verifies the token the same way), and `gh auth switch` is never run. With `github.login` empty (the shipped default), calls use the active account unfenced (#38). `specwright-finish`'s post-merge check runs a plain `gh pr view` even when a login is set (#38). `pr-pair.sh` fences `gh` calls per repo, but its `git` calls on the store run with the code account's credentials (#35). `git fetch` and `git pull` on main (branch gate, roadmap status, finish and pr cleanup) run with the ambient git credentials, unfenced (#38).
- **Cross-model review:** a read-only CLI run that prints the complete review artifact, which contains exactly one `VERDICT:` line (followed by the template's Required Changes, `CHANGES_APPLIED:` and Rebuttals sections). The CLI can read any file in the repo; the change and the files it reads (referenced source, ADRs) go to that provider. On by default; `review.cross_model: false` keeps reviews in-harness.

## Resource bounds and failure visibility

| Flow / store | Bound | At the bound | On failure | Who finds out |
|---|---|---|---|---|
| PR snapshot | 100 per list (threads, comments per thread, comments, reviews, checks) | List overflow sets `complete: false` and `truncated: [...]`; watch hands over to the user, and feedback does too unless only `checks` is cut off | `gh` error → non-zero exit | The user, through the hand-over |
| PR snapshot bodies | Thread comments clipped at 2500 characters, PR comments and reviews at 1200 | Clipping does not change `complete`; the full body must be fetched before an item is judged, but feedback does not require it (#47) | A finding past the cut can be dropped as non-actionable (#47) | Nobody until a reviewer repeats the finding |
| Feedback rounds | `pr.max_fix_rounds` (default 2) | `pr.after_limit`: ask, file issues or stop | Store-backed: the pass record resumes an interrupted pass. Repo-local: no record; a pass interrupted after its last fix was pushed ends in "waiting on owner" (#34). A recovered partial fix is counted as an extra round (#29) | The user at the limit; the agent on resume |
| Watch polling | `pr.poll_interval` (default 5m); reviewer timeout per head (default 20m) | Advisory reviewer stops blocking; required reviewer → ask | Poll error → retry next interval. Gaps: pair readiness does not check that a snapshot matches the current PR head (#31); a cleanup race can delete the newer watcher's token, and that watcher then exits 4 and stops silently (#39) | The agent's watch loop, then the user; nobody in the #39 case |
| Fully paginated metadata reads (`pr-pair.sh` discovery, linking, recovery; after-limit issue reuse) | None: every page is read and held in memory; issue reuse scans all issues once per finding (F × I) | — | Large histories slow every call and grow memory (#40) | Nobody until a call is slow or fails |
| Network commands (`gh`, `git` in the PR scripts) | No Specwright deadline. The watch timeout counts sleep intervals, not elapsed time, and cannot interrupt a poll that hangs | — | A hung command blocks timeout reporting and ownership checks (#40) | Nobody until the user notices |
| Install / update | One project at a time | — | Interrupted update can leave deleted skills; a store's shared schema is replaced for every project (#36) | The user, on the next failing run |
| Design review | Roadmap baseline: at most two rounds, with no rule for when the count resets after a later edit voids a passing verdict (#49; this baseline's round 3 ran with the user's approval); change design review: escalate after 2 consecutive REVISE rounds; one verdict line | REVISE escalates to the user (USER_OVERRIDE) | CLI missing → `specwright-reviewer`; neither → stop | The user |
| Store gate | One holder (atomic `mkdir`) | Second gate stops and names the owner | Interrupted gate leaves the lock → the user confirms removal | The user |
| Task commits | One per task | — | A ticked task without a commit is a gap → Reconcile asks | The agent, then the user |
| Local finish | Archive commit, then merges (store-backed: store, then code) | — | No resume path: re-entry after the archive commit repeats it; after the store merge it reports `Nothing to finish` and leaves the code branch unmerged (#48) | The user, finding the code unmerged |

## Known gaps

Defects where the code does not yet meet this baseline, found in the baseline review (`openspec/architecture-review.md`) and earlier PR reviews. The roadmap schedules them. Issue numbers refer to sh1ny/specwright.

| Gap | Issue |
|---|---|
| Pair readiness accepts a snapshot of another PR or an old head | #31 |
| Feedback pass record has no owner; two sessions can both write it | #32 |
| A reviewer edit during a fix is hidden by the later reply | #33 |
| Repo-local feedback cannot recover a pass interrupted after the last fix was pushed | #34 |
| `pr-pair.sh` git calls on the store use the code account | #35 |
| `rounds` counts a recovered partial fix as an extra round | #29 |
| Adopting a newly found code PR skips the pair-link repair (unverified) | #30 |
| `pass done` deletes the record before a `rerun` reaction is sent | #25 |
| `pass write` accepts a malformed `prs` map | #26 |
| Install/update has no lifecycle for running sessions or shared stores | #36 |
| OpenSpec pin is not enforced | #37 |
| Empty `github.login` (default) is unfenced | #38 |
| Watch cleanup can delete a newer watcher's token, leaving no watcher | #39 |
| Unbounded metadata reads and no command deadlines in the PR scripts | #40 |
| Roadmap init/close write to a store without the branch check or gate lock | #43 |
| Roadmap writes baseline ADRs as `accepted` before the review gate | #44 |
| README and `specwright-pr` do not state the Python 3.8+ dependency the scripts enforce | #45 |
| `pass write` needs Python 3.10+ although the gate accepts 3.8+; unexpected errors escape the JSON contract | #46 |
| Clipped snapshot bodies can be judged without the full text | #47 |
| Local finish cannot resume after an interrupted archive commit or store merge | #48 |
| Baseline review caps rounds at two, with no reset after a later edit | #49 |

## In-force ADRs

The baseline ADRs were accepted once the baseline review of their final text passed (round 3, `openspec/architecture-review.md`).

| ADR | Decision | Supersedes |
|---|---|---|
| [0001](../docs/adr/0001-build-on-unmodified-openspec.md) | Extend OpenSpec only through a schema, skills, agents and templates installed as copies | — |
| [0002](../docs/adr/0002-agent-instructions-with-thin-scripts.md) | The agent follows instructions; deterministic work goes to small bash + git + gh + python3 scripts | — |
| [0003](../docs/adr/0003-git-and-github-as-the-state-store.md) | Git history and GitHub hold workflow evidence; local state is only recoverable working state | — |
| [0004](../docs/adr/0004-process-scoped-github-identity.md) | When a login is configured, authenticated GitHub calls run under a process-scoped, verified login; exceptions: the empty default, `specwright-finish`'s post-merge `gh pr view`, and `git fetch`/`git pull` on main are unfenced (#38) | — |
| [0005](../docs/adr/0005-orchestrator-implementer-reviewer-split.md) | The orchestrator verifies and commits; an implementer agent builds; FULL design reviews run in a fresh context, cross-model when possible | — |
| [0006](../docs/adr/0006-openspec-resolves-the-planning-root.md) | OpenSpec resolves where planning lives; store-backed changes pair branches and commits across two repos | — |
