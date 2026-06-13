# Code Review

Scope: `main...refactor/0016-proposal-make-scan-build-the-deter`

Verdict: **FIX BEFORE MERGE**

Reviewed 21 changed files via 8 parallel reviewer agents. Each reviewer ran `git diff main...refactor/0016-proposal-make-scan-build-the-deter -- <assigned files>` for its assigned files. One disputed test-failure claim was spot-checked with `bun test test/core-commands.test.ts`; result: `139 passed`.

## Findings

### [MEDIUM] Unsafe package entrypoints can escape scan filters

**Files**: `src/core/codebase-index.ts:296-305`, `src/core/commands.ts:573-575`

**Issue**: Package `main`/`module`/`bin` paths are added directly and later persisted without revalidating the generated index. Absolute or `../` paths, or ignored `dist/` paths, can be fingerprinted/written despite traversal filters.

**Why it matters**: `specwright scan` can persist an invalid or unsafe `codebase-index.json`, including paths outside the intended workspace or files excluded from traversal.

**Suggestion**: Normalize package entrypoints through the same safe-relative-path and exclusion checks before adding them; validate the generated index before `writeJsonFile`.

### [MEDIUM] Git path discovery corrupts valid filenames

**File**: `src/core/codebase-index.ts:190-193`

**Issue**: `git ls-files -z` entries are `.trim()`ed. Valid tracked filenames with leading/trailing spaces are changed before `lstat`.

**Why it matters**: The scanner can omit valid tracked files or fingerprint a different trimmed path if it exists.

**Suggestion**: Split on `\0`; filter only `line.length > 0`.

### [MEDIUM] Indexed file cap is bypassed by associated tests

**File**: `src/core/codebase-index.ts:479-488`

**Issue**: Associated tests are appended to modules without cap accounting. Many matching tests can be fingerprinted while `truncated: false`.

**Why it matters**: The deterministic index can exceed its intended resource bounds and report misleading cap state.

**Suggestion**: Count associated tests against the same cap or exclude them from fingerprinted/indexed paths.

### [MEDIUM] Test association by basename is ambiguous

**File**: `src/core/codebase-index.ts:483-488`

**Issue**: `index.test.ts` can attach to the first lexicographic `index.ts` in another directory.

**Why it matters**: The generated module-to-test metadata can point reviewers and agents at unrelated tests.

**Suggestion**: Prefer same-directory/nearest-source matching before basename fallback.

### [MEDIUM] Read stream errors abort scan

**File**: `src/core/codebase-index.ts:118-119`

**Issue**: If a file disappears or becomes unreadable after `stat`, the stream rejection aborts `buildCodebaseIndex`.

**Why it matters**: Scan can fail on ordinary repository churn, especially for untracked files discovered by Git.

**Suggestion**: Catch read-stream errors and mark the path stale/skipped instead of aborting the full index build.

### [MEDIUM] `scan --map` prompt has contradictory artifact ownership

**File**: `src/core/prompts.ts:166-192`

**Issue**: Map mode still says agent-owned files include `scan.md`, `tech-stack.md`, and `architecture.md`, while retry/update target narrows to `codebase-map.md`.

**Why it matters**: A map-only scan can instruct agents to edit non-map project intelligence files.

**Suggestion**: Make ownership/update lists mode-aware.

### [MEDIUM] New test gaps allow empty or silent rebuilds

**File**: `test/core-commands.test.ts:2775-2779`, `test/core-commands.test.ts:3055-3058`

**Issue**: Invalid-index rebuild test does not assert live files are re-indexed. Deleted-file refresh test does not assert stale/missing state is reported.

**Why it matters**: Regressions that write an empty index or silently drop stale-file reporting can pass.

**Suggestion**: Assert rebuilt index contains current files and `staleFiles` records missing deleted paths.

### [MEDIUM] Specwright artifacts contain stale/contradictory contracts

**Files**:
- `.specwright/changes/0016-proposal-make-scan-build-the-deterministic-codebase-index-itself-reader/intent.md`
- `.specwright/changes/0016-proposal-make-scan-build-the-deterministic-codebase-index-itself-reader/research.md`
- `.specwright/changes/0016-proposal-make-scan-build-the-deterministic-codebase-index-itself-reader/evidence.md`
- `.specwright/changes/0016-proposal-make-scan-build-the-deterministic-codebase-index-itself-reader/sources.md`
- `.specwright/changes/0016-proposal-make-scan-build-the-deterministic-codebase-index-itself-reader/handoff.md`

**Issue**: Git discovery policy contradicts itself; `--map` contract conflicts with final settled behavior; cap-test plan needs a limit override not present in the proposed helper contract; research/evidence/sources cite pre-change line ranges and deleted functions as current; handoff sections are blank despite completed tasks and PASS verification.

**Why it matters**: `.specwright` artifacts are source-of-truth workflow records. Stale or contradictory artifacts mislead future execution, verification, and handoff.

**Suggestion**: Refresh artifacts to clearly label baseline-vs-implemented evidence, resolve `--map`/discovery contracts, and fill handoff current state/acceptance/next task.

### [LOW] Change record metadata is incomplete

**File**: `.specwright/changes/0016-proposal-make-scan-build-the-deterministic-codebase-index-itself-reader/change.md`

**Issue**: Title includes copied Markdown headings; summary is empty.

**Why it matters**: Status/handoff readers see a malformed change index artifact.

**Suggestion**: Use a plain title and one concise summary.

## Summary

| Severity | Count |
|---|---:|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 8 |
| LOW | 1 |

## Recommended Actions

1. Fix index safety first: sanitize package entrypoints, preserve Git path bytes, cap associated tests, and handle stream errors.
2. Resolve prompt and artifact contract contradictions around `scan --map` and discovery.
3. Add regression assertions for rebuilt live files and stale missing files.
4. Refresh handoff/change metadata before merge.
