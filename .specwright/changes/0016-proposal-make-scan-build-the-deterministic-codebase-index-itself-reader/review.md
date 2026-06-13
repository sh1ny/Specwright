# Code Review

Scope: `main...refactor/0016-proposal-make-scan-build-the-deter`

Verdict: **READY FOR RE-REVIEW** after follow-up remediation; merge still requires a fresh review verdict.

Reviewed the current PR scope via 8 parallel reviewer agents. This artifact supersedes the earlier 21-file review snapshot.

## Historical findings resolved in this branch

No open findings remain from the previous review snapshot; the entries below are retained only as resolved history.

### [MEDIUM] Deterministic ordering depends on host locale

**File**: `src/core/codebase-index.ts`

**Issue**: Index sorting uses `localeCompare`, so entrypoint, module, command, verification, risk, stale-file, and fingerprint order can differ across host locale/ICU settings.

**Required fix**: Use a private code-unit comparator for all deterministic index ordering and prove the public module order follows it.

### [MEDIUM] Root test directories are not classified as tests

**File**: `src/core/codebase-index.ts`

**Issue**: `isTestFile()` only matches `test/`, `tests/`, and `__tests__/` when preceded by a slash, so root-level test directories can become normal modules or lose source associations.

**Required fix**: Match root and nested test directories after slash normalization while keeping the basename suffix rule.

### [MEDIUM] Exact scan cap is reported as truncation

**File**: `src/core/codebase-index.ts`

**Issue**: Discovery marks `truncated: true` as soon as `files.length >= maxFilesScanned`, even when exactly the cap was scanned and no eligible file was omitted.

**Required fix**: Set truncation only when an eligible regular file would be skipped because the cap is already full.

### [MEDIUM] Duplicate entrypoints inflate indexed cap accounting

**File**: `src/core/codebase-index.ts`

**Issue**: The same path can be added once from package metadata and again from inferred entrypoint detection, producing duplicate entries and duplicate `indexedFiles` increments.

**Required fix**: Deduplicate entrypoints and modules by path before cap accounting, while allowing a path to appear once in each array.

### [MEDIUM] Large-file risks are emitted for unindexed files

**File**: `src/core/codebase-index.ts`

**Issue**: The pre-classification pass reports `large file skipped` for oversized assets that are discovered but never fingerprint candidates.

**Required fix**: Emit the risk only during fingerprinting for oversized indexed paths.

### [MEDIUM] Risk ordering is not final after fingerprint-time additions

**File**: `src/core/codebase-index.ts`

**Issue**: Risks are sorted before existing user risks and fingerprint-time large-file risks are appended, so final risk order can drift.

**Required fix**: Use a shared private risk comparator and sort once after all deterministic and preserved risks are present.

### [MEDIUM] Index-builder regression tests miss review cases

**File**: `test/core-commands.test.ts`

**Issue**: Existing tests do not cover root test directories, exact scan-cap semantics, indexed-only large-file risks, deduped package/inferred entrypoints, Git tracked/untracked/ignored discovery, or code-unit sort order.

**Required fix**: Add targeted regression tests for each case.

### [MEDIUM] Core scan prompt has overbroad ownership wording

**Files**: `src/core/prompts.ts`, `test/core-prompts.test.ts`

**Issue**: The prompt tells agents that broad machine-derived arrays are command-owned without clearly scoping the do-not-edit rule to `codebase-index.json`, while map mode needs prose-only ownership wording.

**Required fix**: Make the JSON/machine-field boundary explicit and update default, map, and refresh prompt assertions.

### [MEDIUM] OMP scout guidance references stale contract text

**Files**: `src/runtime/omp/prompts.ts`, `test/core-prompts.test.ts`

**Issue**: OMP scan guidance tells scouts to use the "bounded discovery and mapping contract", a stale phrase that no longer names the exact core prompt sections scouts must obey.

**Required fix**: Point scouts at the `Ownership boundary` and `Agent contract` sections and assert the stale phrase is absent.

### [MEDIUM] Change planning artifacts still describe Git discovery as future work

**Files**:
- `.specwright/changes/0016-proposal-make-scan-build-the-deterministic-codebase-index-itself-reader/options.md`
- `.specwright/changes/0016-proposal-make-scan-build-the-deterministic-codebase-index-itself-reader/plan.md`

**Issue**: The artifacts still say Git-assisted discovery can be added later and omit the Git worktree verification case, while the implementation already uses Git listing when available.

**Required fix**: Update the stale statements without rewriting human-owned content.

### [MEDIUM] Project scan prose still describes manual index ownership

**Files**:
- `.specwright/project/codebase-map.md`
- `.specwright/project/scan.md`
- `.specwright/project/architecture.md`
- `.specwright/project/tech-stack.md`

**Issue**: Project-level prose can still imply `codebase-index.json` is manually curated by scan agents instead of command-owned JSON/fingerprint data.

**Required fix**: Refresh plain scan output and patch only stale prose caused by the codebase-index ownership shift.

## Resolution status

- [x] Deterministic ordering depends on host locale.
- [x] Root test directories are not classified as tests.
- [x] Exact scan cap is reported as truncation.
- [x] Duplicate entrypoints inflate indexed cap accounting.
- [x] Large-file risks are emitted for unindexed files.
- [x] Risk ordering is not final after fingerprint-time additions.
- [x] Index-builder regression tests miss review cases.
- [x] Core scan prompt has overbroad ownership wording.
- [x] OMP scout guidance references stale contract text.
- [x] Change planning artifacts still describe Git discovery as future work.
- [x] Project scan prose still describes manual index ownership.

## Follow-up review remediation

- [x] Unique indexed cap accounting.
- [x] Oversized stale reporting.
- [x] Ignored package metadata.
- [x] Stable fingerprint mtimes.
- [x] OMP read-only scouts.
- [x] Verify/review consistency.
- [x] Decisions ready state.
- [x] Research invalid-index wording.
