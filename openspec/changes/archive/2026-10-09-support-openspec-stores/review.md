# Review

## Metadata

- **Round:** 7
- **Prior round:** Round 6 returned REVISE for N22–N24: effective push identity, incomplete historical-PR discovery and stale feedback dispositions. Continued revise-and-review rounds are explicitly authorized.
- **Reviewer:** cross-model CLI (omp, openai-codex/gpt-6.1-sol), fresh context; did not author the change.
- **Reviewed:**
  - `openspec/changes/support-openspec-stores/{proposal.md,design.md,specs/planning-stores/spec.md}`
  - The supplied `review-round6.md` and `rebuttals-r6.md`
  - All six `skills/*/SKILL.md` files
  - `skills/specwright-pr/scripts/{as,pr-snapshot,pr-reply}.sh` and `references/{description,rubric}.md`
  - Reviewer and implementer agents under `agents/claude/` and `agents/omp/`
  - `schemas/specwright/schema.yaml` and `schemas/specwright/templates/review.md`
  - `evals/git-workflow/{fixtures.py,grade.py,evals.json}`
  - `templates/openspec/{config.yaml,specwright.yaml}`, actual project config/settings, and relevant README installation, workflow, scripts, settings and manual-installation sections
  - Installed OpenSpec package manifest, confirming **1.14.1**, and relevant sections of:
    - `dist/core/{root-selection,project-config,global-config,list,archive,references,id}.js`
    - `dist/core/store/registry.js`
    - `dist/core/artifact-graph/{resolver,instruction-loader}.js`
    - `dist/commands/workflow/{shared,status,templates}.js`
    - `dist/commands/{schema,context}.js`
    - `dist/cli/index.js` and `dist/cli/commands/schema.js`
    - `dist/utils/change-utils.js`
  - Official Git documentation for effective remote URLs, GitHub CLI documentation for API pagination, and GitHub REST documentation for pull-request listing
- **ADRs:** Confirmed that `openspec/architecture.md` and `docs/adr/` do not exist. Project settings retain those default locations; no alternative ADR location is configured.
- **Method:** Read-only source and contract tracing. No files created, edited or deleted. No git, gh, OpenSpec or eval commands executed. Predicted workflow failures are marked `[INFERENCE]`.

Here, `design.md`, `proposal.md` and `spec.md` mean this change’s artifacts. OpenSpec `dist/` references mean the installed 1.14.1 package. This review assesses the proposed design, not an implemented feature.

<!-- This verdict covers only the contents reviewed. Editing proposal, specs or design afterward (other than applying Required Changes) voids it. -->

## Findings

### Critical (blocking)

None open.

### Moderate

#### N25 — Archive discovery assumes OpenSpec always prepends a date, but date-prefixed change names are preserved

**Status:** Newly identified compatibility defect in D2 and D9; independent of N22–N24.

**Evidence:**

- D2 prescribes locating the archive with `<root.path>/openspec/changes/archive/*-<change-name>/` (`design.md:76`).
- D9 requires that same suffix pattern on planning main before checking either the planning-only marker or merged-code proof (`design.md:216-220`).
- The spec assumes `<date>-<change-name>` in fresh-session discovery, marker placement and merged-change evidence (`spec.md:20-22,124-126,326-328`).
- OpenSpec permits leading digits in change names. `validateChangeName` uses the shared kebab-ID grammar, which accepts names such as `2026-10-07-add-greeting` (`dist/utils/change-utils.js:10-68`; `dist/core/id.js:5-7`).
- OpenSpec explicitly preserves a name already beginning with `YYYY-MM-DD-`:
  - `ARCHIVE_DATE_PREFIX_PATTERN` identifies that convention (`dist/core/archive.js:23-28`).
  - Archive chooses `changeName` itself when that pattern matches; otherwise it chooses `${formatLocalDate()}-${changeName}` (`:1313-1325`).
  - Successful JSON output includes the actual `archivedAs` and `path` (`:1839-1842`).
- The existing finish skill refers to the actual `<dated-name>` rather than requiring a newly prepended date (`skills/specwright-finish/SKILL.md:14`).

**Consequence [INFERENCE]:**

For change `2026-10-07-add-greeting`, OpenSpec creates:

`openspec/changes/archive/2026-10-07-add-greeting/`

D2 instead searches for:

`openspec/changes/archive/*-2026-10-07-add-greeting/`

That pattern cannot match the actual directory: it requires an additional prefix and hyphen before the complete change name.

A fresh finish session therefore has no prescribed way to discover and stage this successful archive or place its planning-only marker. Even after the archive and code work reach their respective mains, D9 cannot recognize the actual archive, so roadmap status does not report done and `next` cannot use the change as a completed prerequisite.

This is a supported OpenSpec naming convention, not malformed input.

**Required correction:** Use OpenSpec’s actual archive-name rule consistently for finish discovery, marker placement and roadmap evidence. Exact edits are listed below.

### Suggestions

None additional.

## Verdict

VERDICT: APPROVE_WITH_CHANGES

N22–N24 are resolved and accepted below. The remaining Moderate defect has a bounded correction: archive identity must follow the installed OpenSpec naming rule.

FULL triage remains appropriate: cross-repository writes, recovery intent, concurrent waits, external contracts and authentication boundaries are present. No architectural redesign is required for N25.

## Required Changes

1. **Correct D2’s “Finding the archive” rule (`design.md:76`).**
   - Use the successful archive workflow’s actual returned directory when available.
   - For fresh-session discovery, explicitly follow OpenSpec 1.14.1: a change name beginning with `YYYY-MM-DD-` is archived under that exact name; otherwise its archive name is `YYYY-MM-DD-<change-name>`.
   - Apply the same naming rule to bulk-archive discovery, retaining the current planning-repository and new-path checks.

2. **Correct D9’s archive predicate (`design.md:216`).**
   - Replace the unconditional `*-<name>` predicate with a reference to D2’s archive-name rule.
   - Read the matching directory from planning main before applying the existing marker or merged-code proof. Do not change those proof requirements.

3. **Correct the spec’s archive-path notation.**
   - Define `<archived-name>` as the actual name assigned by OpenSpec, including preservation of an existing `YYYY-MM-DD-` prefix.
   - Replace the unconditional `<date>-<change-name>` paths in “Root found after archive,” “Planning-only archive” and “Both repos merged” (`spec.md:22,126,327`) with `<archived-name>`.

4. **Add explicit date-prefixed boundary scenarios.**
   - Under planning-root discovery: after archiving `2026-10-07-add-greeting`, a fresh finish session finds `<root>/openspec/changes/archive/2026-10-07-add-greeting/`, without expecting another date prefix.
   - Under planning-only archive recording: when that change meets the existing planning-only test, its marker is committed inside that actual directory.
   - Under roadmap completion: when planning main contains that directory and the existing required code-side proof holds, status reports done and `next` accepts it as a completed prerequisite.

**Re-check:** Item 1 **applied as required**: D2 uses the reported archive directory when available, preserves an existing `YYYY-MM-DD-` prefix during fresh-session discovery, and applies the same rule to bulk discovery while retaining the planning-repository and new-path checks (`design.md:76`); this matches the installed naming rule and returned archive identity (`dist/core/archive.js:23-28,1322-1325,1839-1842`). Item 2 **applied as required**: D9 references D2’s `<archived-name>` rule, reads the archive from planning main, and retains the planning-only marker and existing local/PR merged-code proof requirements (`design.md:215-220`). Item 3 **applied as required**: the spec defines `<archived-name>` with prefix preservation (`spec.md:36-37`) and uses it in “Root found after archive,” “Planning-only archive” and “Both repos merged” (`spec.md:20-22,128-130,334-336`). Item 4 **applied as required**: explicit scenarios cover fresh-session discovery without another prefix (`spec.md:24-26`), marker commitment inside the actual date-prefixed archive directory (`spec.md:132-134`), and done status plus completed-prerequisite acceptance when planning main contains that directory and the required code-side proof holds (`spec.md:338-340`).

## Rebuttals

### N22 — Repository binding reads the fetch URL, not necessarily the push destination

- **Author response:** D5 now reads `git remote get-url origin` and every effective push URL from `git remote get-url --push --all origin`. Different repository identities stop publication. Fork and mirror push targets remain unsupported. D8’s `ls-remote origin` consequently reads the same repository used for publication. Added “Fetch and push URLs name different repositories.”
- **Reviewer:** **accepted by reviewer**.
  - D5 establishes the fetch/push repository invariant before publishing and excludes ambient gh selection from identity derivation (`design.md:136-137`).
  - Git’s documentation confirms that `get-url` expands URL rewrites, `--push` selects push URLs and `--all` enumerates them. The revised procedure inspects the effective destinations rather than assuming the fetch URL is sufficient.
  - The boundary scenario requires stopping before the store push or store PR lookup (`spec.md:223-225`).
  - With that invariant, D8’s publication check (`design.md:201`) no longer reads a different repository from the push destination. Authentication remains separately fenced by the existing wrapper, whose current-repository header scrub is preserved by D1’s working-directory rule (`as.sh:13-14,46-55`).

### N23 — Filtering the default 30 PR results can erase the code PR from the expected set

- **Author response:** Replaced historical lookups with paginated REST discovery, using server-side head-owner/branch filtering followed by exact head-repository filtering. Failed or partial discovery means unknown, not absence. The same discovery serves ship, membership, planning-only classification, cleanup and roadmap proof. Added “Matching PR beyond the first page.”
- **Reviewer:** **accepted by reviewer**.
  - D5 now prescribes `gh api --paginate` with `state=all`, `head=<owner>:<branch>` and `per_page=100`, then verifies `head.repo.full_name` (`design.md:138`).
  - GitHub’s REST contract supports both user and organization forms of the head filter. The gh API contract confirms that `--paginate` continues until no pages remain; this is not merely a larger fixed result limit.
  - Main-base filtering and the wrong-base ship stop remain explicit (`design.md:139`).
  - Expected-set membership and planning-only classification use this discovery (`design.md:120-122`); D9 uses it for merged-code proof and treats failure as unknown (`:215-220`).
  - The scenario preserves the older merged code PR despite the newer fork matches (`spec.md:227-229`). Existing snapshot truncation remains a separate fail-closed contract; the revision does not claim to paginate its nested connections.

### N24 — Recovery binds a disposition to an item ID but not to the reviewer revision it judged

- **Author response:** Each recorded finding now stores its judged `rev` and, for threads, the latest reviewer comment’s ID and timestamp. Resume compares fresh source evidence before replaying a disposition. Changed reviewer content stops the stale reply/resolution and is reported to the user. Added “Reviewer follow-up during the interruption.”
- **Reviewer:** **accepted by reviewer**.
  - The intent record now includes the judged revision and reviewer-comment boundary (`design.md:195`).
  - Before an unanswered item receives its recorded reply, resume compares fresh evidence; a changed revision or later reviewer comment causes no reply and no resolution from the old disposition, followed by a stop and report (`design.md:203`).
  - The existing snapshot supplies the required evidence: thread revisions cover comment additions and edits, thread comments expose IDs and timestamps, and comment/review bodies expose their edit revision (`pr-snapshot.sh:139-168`).
  - Already-posted replies are recognized through the answered state rather than replayed. Pending resolution remains human-gated, preserving the existing distinction between a failed resolution and a reopened thread (`design.md:204`; `skills/specwright-pr/SKILL.md:64`).
  - The added scenario expressly prohibits consuming a follow-up or edited finding through the old pass’s reply or resolution (`spec.md:292-294`). This closes the interruption sequence identified in Round 6.

CHANGES_APPLIED: yes
