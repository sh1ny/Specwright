# Agent Handoff: 0016

## Goal

# Intent

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">
## Goal

Make plain `specwright scan` command-owned for mechanical deterministic codebase indexing, while keeping semantic project prose artifacts agent-owned. The command creates and refreshes `.specwright/project/codebase-index.json` (file inventory, fingerprints, package scripts, entrypoints, modules, tests, commands, verification, cap/truncation risks) without requiring agents to author, paste, or hand-edit checksum JSON. Plain scan decides whether the index is missing, stale, or current; `--refresh` remains a compatibility spelling for the same deterministic path.

## Users

Internal Specwright maintainers implementing the next scan/index increment; end users running `specwright scan` who need an up-to-date deterministic index; and agents/scouts that consume the index as read-only evidence while editing only prose artifacts.

## Non-goals

- Adding a new required `--index` subcommand.
- Making agents paste or hand-edit fingerprint JSON in `codebase-index.json`.
- Preserving semantic fields from an existing index that has hard validation errors (`SW100`, `SW101`, `SW103`-`SW105`, `SW107`-`SW109`).
- Classifying every file in a tree (binary, vendor, generated, symlinked, and oversized files are skipped).
- Requiring Git for correctness (non-Git projects use deterministic filesystem fallback).
- Moving OMP-specific parallel scout wording into core scan prompts.

</frozen-after-approval>

## Approval notes
### Source request
@localdocs/SCAN-SEAMLESS-DETERMINISTIC-INDEX-PROPOSAL.md
### Expanded request
# Proposal: Make scan build the deterministic codebase index itself

## Reader

Internal Specwright maintainer implementing the next scan/index increment.

## Post-read action

Make plain `specwright scan` command-owned for mechanical codebase indexing, while keeping semantic project prose agent-owned.

## Problem

`specwright scan` now creates map artifacts and can report stale fingerprints, but it still treats deterministic index population as agent work. That is the wrong ownership boundary.

Fingerprints, file inventory, package scripts, obvious entrypoint candidates, module/test lists, command names, verification commands, and cap/truncation risks are mechanical facts. The command can compute them more reliably than an agent can paste JSON. The agent should spend attention on prose: what the files mean, where risks matter, and which architecture notes are useful for future phases.

The pre-change flow also made refresh non-seamless. A user had to know when to run `--refresh`, then the prompt asked an agent to copy a fingerprint block into `codebase-index.json`. Plain `specwright scan` should decide whether the index is missing, stale, or current.

## Evidence from current implementation

Pre-change behavior:

- Scan args already parsed `--map` and `--refresh` as first-class flags in `ParsedArgs`. Help advertised `specwright scan [--map] [--refresh] [--force] [--json] [--print-prompt]`.
- `commandScan()` ensured `.specwright/project/scan.md`, `tech-stack.md`, `architecture.md`, and `codebase-map.md`; created a default `codebase-index.json` with empty arrays and empty `fingerprints`; validated the index; then returned a prompt and optional JSON payload.
- Refresh only compared files already referenced by `entrypoints`, `modules`, and module `tests`; it computed current fingerprints for those tracked paths and reported stale files. When stale files existed, the prompt asked the agent to update `codebase-index.json` with an exact fingerprint JSON object; the command did not write those updated fingerprints.
- `validateCodebaseIndex()` checked the index object shape: version, required arrays, safe relative paths, missing/non-file warnings, object entries, string fields, test paths, risk areas, and fingerprint object shape.
- The original fingerprint helper read the whole file and hashed SHA-256. The deterministic builder replaces that with streaming hashing for indexed files, so large indexed files do not have to be loaded fully into memory.
- Refresh tests that asserted agent-authored fingerprint blocks changed to command-owned index writes.
- Existing prompt tests assert that core scan prompts are runtime-neutral and that OMP-only parallel scout wording lives in the OMP prompt adapter. Preserve that boundary.

## Decision

Make plain `specwright scan` / `/specwright scan` the primary seamless UX.

The command decides whether to:

1. create the first deterministic index;
2. refresh stale deterministic data;
3. report that the deterministic index is already current.

Do not add a required user-facing `--index` command.

Existing `--map`, `--refresh`, `--force`, `--json`, and `--print-prompt` may remain for compatibility and targeted tests. `scan --refresh` becomes compatibility spelling for the same deterministic refresh path used by plain `scan`. It may add refresh-specific wording to the prompt, but it must never make checksum JSON agent-owned.

Ownership boundary:

- Command-owned: file inventory, fingerprints, package scripts, obvious entrypoint candidates, module paths, test paths, command names extractable from code/config, verification commands, scan caps, and truncation risks.
- Agent-owned: `scan.md`, `tech-stack.md`, `architecture.md`, `codebase-map.md`, semantic summaries, architecture interpretation, convention notes, and human-readable risk interpretation.
- Never agent-authored: checksums/fingerprints.

## Seamless command behavior

Plain `specwright scan` should run the deterministic index builder every time after project artifacts are ensured.

Command flow:

1. Ensure project artifacts exactly as current code does (`src/core/commands.ts:598-623`).
2. Read existing `.specwright/project/codebase-index.json` if present.
3. Validate the existing index.
4. If validation has hard shape/path/fingerprint errors (`SW100`, `SW101`, `SW103`-`SW105`, `SW107`-`SW109`), do not preserve semantic fields from the invalid object. Build from scratch and surface validation issues in the prompt.
5. Treat warning-only validation issues (SW102, SW106) as non-blocking for preservation.
6. Run `buildCodebaseIndex({ cwd: ctx.cwd, now: ctx.now(), existing })`.
7. Write `codebase-index.json` only when `BuildCodebaseIndexResult.changed` is true, the file is missing, or `--force` is supplied.
8. Return JSON payload fields that make the state machine observable: `indexUpdated`, `staleFiles`, `scannedFiles`, `indexedFiles`, `truncated`.
9. Generate the scan prompt with a concise deterministic summary.

If only fingerprints changed, the prompt should say prose docs may need review. It must keep checksum JSON command-owned.

`--map` remains a focused prose-artifact compatibility mode, but deterministic index generation is identical to plain scan: command-owned, always rebuilt through `buildCodebaseIndex()`, and never agent-authored.

## Filesystem discovery policy

Use git-assisted discovery when available, with deterministic filesystem fallback for non-Git projects.

Rules:

- Prefer `git ls-files -z --cached --others --exclude-standard` when Git is available, preserving exact NUL-separated paths.
- Fall back to a recursive walker using `node:fs/promises` APIs.
- Do not require Git for correctness.
- Default excludes: `.git/`, `node_modules/`, `.specwright/cache/`, `.specwright/tmp/`, generated `.omp/` output, `dist/`, `build/`, `.next/`, `coverage/`, `target/`.
- Do not follow symlinked directories.
- Skip symlinked files by default and record a deterministic risk entry with `area: "symlink skipped"`.
- Skip binary and oversized files for semantic classification.
- Compute fingerprints only for indexed text/source/config/test files, not every file in a giant tree.
- Add hard caps and record cap hits in `risks`.

Initial caps:

```ts
maxFilesScanned = 50000;
maxGitLsFilesBytes = 64 * 1024 * 1024;
maxIndexedFiles = 5000;
maxFingerprintBytesPerFile = 1048576;
maxRisksPerArea = 64;
```

Cap behavior:

- If `maxFilesScanned` is exceeded, stop discovery after the first omitted eligible regular file and record `area: "scan coverage"`.
- If `maxGitLsFilesBytes` is exceeded, stop Git discovery, keep paths already read from Git, do not fall back to filesystem recursion, and record `area: "scan coverage"`.
- If `maxIndexedFiles` is exceeded, truncate indexed candidates deterministically and record `area: "scan coverage"`.
- If `maxRisksPerArea` is exceeded for an area, append one omitted-risk sentinel for that area and set the result truncated flag.
- If an otherwise indexed file exceeds `maxFingerprintBytesPerFile`, skip its fingerprint and record `area: "large file skipped"`.

## Deterministic index builder

Add a new runtime-neutral core module:

```ts
// src/core/codebase-index.ts
export interface BuildCodebaseIndexOptions {
  cwd: string;
  now: Date;
  existing?: CodebaseIndex;
  limits?: Partial<{
    maxFilesScanned: number;
    maxGitLsFilesBytes: number;
    maxIndexedFiles: number;
    maxFingerprintBytesPerFile: number;
    maxRisksPerArea: number;
  }>;
}

export interface BuildCodebaseIndexResult {
  index: CodebaseIndex;
  changed: boolean;
  staleFiles: string[];
  scannedFiles: number;
  indexedFiles: number;
  truncated: boolean;
}

export async function buildCodebaseIndex(options: BuildCodebaseIndexOptions): Promise<BuildCodebaseIndexResult>;
```

Clean type ownership:

- Move the shared `CodebaseIndex` type out of `src/core/commands.ts` and `src/core/validators.ts` into `src/core/codebase-index.ts`.
- Import `CodebaseIndex` from the new module in both command and validator code.
- Do a clean cutover. No compatibility alias.

Builder rules:

- Preserve existing `summary`, `kind`, and manually curated semantic fields for paths/commands that still exist.
- Recompute `generatedAt` only when the deterministic index changes.
- Recompute `fingerprints` for every indexed path selected by the builder.
- Remove fingerprints for paths no longer indexed.
- Add deterministic risk entries for truncation/caps.
- Preserve manually authored risks only when their `area` is not reserved.
- Reserved deterministic risk areas: scan coverage, large file skipped, symlink skipped, unsafe path skipped.
- Use streaming SHA-256 for fingerprinting in this module instead of extending `computeFileFingerprint()` as-is, because `computeFileFingerprint()` currently reads the entire file into memory (`src/core/json.ts:17-19`).

Deterministic extraction targets:

- package scripts from package manager config files;
- obvious CLI/bin entrypoints;
- source modules under conventional source directories;
- test files under conventional test directories or matching test filename patterns;
- verification commands from package scripts and known project config;
- command names that can be extracted without semantic interpretation.

## Agent contract

The scan prompt should make the boundary explicit.

Agent responsibilities:

1. Read the deterministic summary and validation issues.
2. Update `scan.md`, `tech-stack.md`, `architecture.md`, and `codebase-map.md` when current code changes semantic understanding.
3. Preserve existing confirmed prose unless contradicted by current code.
4. Record uncertainty as open questions.
5. Never author, paste, or hand-edit fingerprints.
6. Never treat `codebase-index.json` summaries as the only source of semantic truth.

Command responsibilities:

1. Create and refresh `codebase-index.json`.
2. Keep fingerprints current.
3. Surface validation and cap risks.
4. Produce observable JSON output for automation.
5. Keep core prompt wording runtime-neutral.

OMP-specific parallel scout guidance remains in `src/runtime/omp/prompts.ts`, not in core prompt rendering.

## Acceptance criteria

- Running plain `specwright scan --json` in a non-Git temp project with `package.json`, `src/cli.ts`, and `test/cli.test.ts` writes a populated `codebase-index.json` with entrypoints/modules/verification/fingerprints.
- Running plain `specwright scan --json` a second time without file changes reports `indexUpdated: false` and does not rewrite `codebase-index.json`.
- Editing an indexed source file and running plain `specwright scan --json` updates that file's fingerprint without requiring agent-authored JSON.
- A project with no `.git/` indexes correctly.
- A project exceeding caps records a deterministic `scan coverage` risk and marks the result truncated.
- Existing `--map` behavior still creates only map artifacts when used, unless the implementer deliberately updates tests to document that `codebase-index.json` is always command-owned.
- Existing `--refresh` tests are updated so refresh no longer instructs the agent to paste fingerprint data into JSON.
- Core scan prompt remains runtime-neutral; OMP-only parallel scout guidance remains in `src/runtime/omp/prompts.ts`.

## Test plan

Future verification block:

```bash
bun test test/core-commands.test.ts test/core-validators.test.ts test/core-prompts.test.ts
bun run typecheck
```

Focused scenarios:

1. Non-Git first scan creates deterministic index.
   - Fixture: temp dir with no `.git/`, `package.json` containing scripts, `src/cli.ts`, and `test/cli.test.ts`.
   - Run: `runSpecwrightCommand(ctx, ["scan", "--json"])`.
   - Expect: JSON payload has `indexUpdated: true`; index arrays are non-empty; fingerprints include indexed files.
2. Idempotent second scan.
   - Run the same command again without file changes.
   - Expect: `indexUpdated: false`; index bytes unchanged.
3. Changed file refresh.
   - Edit `src/cli.ts`.
   - Run plain `scan --json`.
   - Expect: `staleFiles` contains `src/cli.ts (changed)` and the fingerprint in `codebase-index.json` changes.
4. Existing invalid index shape.
   - Seed unsafe path or malformed fingerprint.
   - Run plain `scan --json`.
   - Expect: no throw; validation issues surfaced; rebuilt safe deterministic index does not keep unsafe path.
5. Cap/truncation behavior.
   - Lower caps via direct helper options in unit test rather than creating 50000 files.
   - Expect: `truncated: true` and `risks` includes `area: "scan coverage"`.
6. Prompt boundary.
   - Update prompt tests so core does not ask for manual fingerprint JSON and still omits OMP wording; OMP prompt still mentions parallel read-only scouts.

## Implementation order

1. Add `src/core/codebase-index.ts` with shared type, filesystem walker, classifier, streaming fingerprint helper, and builder result.
2. Move `CodebaseIndex` imports in `src/core/commands.ts` and `src/core/validators.ts` to the new module.
3. Replace path-only refresh logic with builder result integration in `commandScan()`.
4. Update JSON output and prompt construction to report deterministic index state and never request manual fingerprint JSON.
5. Update tests in `test/core-commands.test.ts`, `test/core-prompts.test.ts`, and `test/core-validators.test.ts`.
6. Run targeted tests and typecheck.

## Success signal

A maintainer can run plain `specwright scan --json` in a fresh non-Git project and get a populated, deterministic, current `codebase-index.json` without any agent-authored checksum JSON. Re-running scan without changes is a no-op. Editing an indexed file updates its fingerprint through the command path. The agent prompt only asks for semantic prose review.

### Discuss settlements

- `specwright scan --map` remains accepted only as compatibility spelling; it should not keep a separate map-only deterministic index path.
- Hard validation errors in an existing `codebase-index.json` trigger a deterministic rebuild without preserving semantic fields from the invalid object.
- Discovery should be git-assisted when Git is available and fall back to deterministic filesystem discovery for non-Git projects.
- Scan prompts must never ask agents to author, paste, or hand-edit fingerprints; agents own semantic prose only.

## Read first

- .specwright/changes/0016-proposal-make-scan-build-the-deterministic-codebase-index-itself-reader/intent.md
- .specwright/changes/0016-proposal-make-scan-build-the-deterministic-codebase-index-itself-reader/evidence.md
- .specwright/changes/0016-proposal-make-scan-build-the-deterministic-codebase-index-itself-reader/tasks.md
- .specwright/changes/0016-proposal-make-scan-build-the-deterministic-codebase-index-itself-reader/verify.md
Optional project context:
- .specwright/project/codebase-map.md
- .specwright/project/codebase-index.json

## Current state

status=done; step=handoff

## Constraints

See intent.md and evidence.md.

## Acceptance

# Verification

## Result

PASS

## Issues

No issues.

## Observed output

Observed commands and outputs from this 0016 verification run follow.

### Targeted implementation regressions

Command:
```
bun test test/core-commands.test.ts -t "buildCodebaseIndex filesystem fallback stops after first omitted regular file"
```

Output:
```
Test Results:
   PASS: 1 passed
```

Exit status: 0.

Command:
```
bun test test/core-commands.test.ts -t "buildCodebaseIndex excludes non-source fixtures inside test directories from modules"
```

Output:
```
Test Results:
   PASS: 1 passed
```

Exit status: 0.

### Targeted review test gaps

Command:
```
bun test test/core-commands.test.ts -t "scan preserves SW106 warnings while rebuilding deterministic data"
```

Output:
```
Test Results:
   PASS: 1 passed
```

Exit status: 0.

Command:
```
bun test test/core-commands.test.ts -t "buildCodebaseIndex keeps Git discovery results when git output byte cap is exceeded"
```

Output:
```
Test Results:
   PASS: 1 passed
```

Exit status: 0.

Command:
```
bun test test/core-validators.test.ts -t "validateCodebaseIndex reports SW102 generatedAt type drift as a warning"
```

Output:
```
Test Results:
   PASS: 1 passed
```

Exit status: 0.

### Affected suites

Command:
```
bun test test/core-commands.test.ts test/core-prompts.test.ts test/core-validators.test.ts
```

Output:
```
Test Results:
   PASS: 219 passed
```

Exit status: 0.

### TypeScript type check

Command:
```
bun run typecheck
```

Output:
```
$ tsc --noEmit
```

Exit status: 0.

### Artifact refresh smoke check

Command:
```
bun src/cli.ts scan --json
```

Output:
```json
{
  "generatedValidation": {
    "ok": true,
    "issues": []
  },
  "summary": "Prepared project scan prompt.",
  "map": false,
  "refresh": false,
  "indexUpdated": false,
  "staleFiles": [],
  "scannedFiles": 287,
  "indexedFiles": 25,
  "truncated": false,
  "filesCreated": [],
  "filesUpdated": [],
  "validation": {
    "ok": true,
    "issues": []
  },
  "prompt": "# Specwright Scan\n\nContext budget:\n- max_context_files: 6\n- max_output_words: 1200\n- Do not load full packs or unrelated docs.\n- Summarize sources; cite paths and URLs.\n\nInspect the repository and update the project intelligence prose files.\n\nDeterministic index state:\n- codebase-index.json updated: false\n- Files scanned: 287\n- Files indexed: 25\n- Truncated/capped: no\n- Stale files: none\n\nOwnership boundary:\n- Command-owned (do not edit directly): .specwright/project/codebase-index.json and its machine fields: fingerprints, file inventory, package-script-derived entries, deterministic entrypoint/module/test/command/verification arrays, and cap/truncation risks.\n- Agent-owned (edit prose only): .specwright/project/scan.md, .specwright/project/tech-stack.md, .specwright/project/architecture.md, .specwright/project/codebase-map.md. You may summarize current index facts in prose, but never paste or hand-edit JSON/fingerprint data.\n\nAgent contract:\n- Update the agent-owned prose artifacts based on current code.\n- Preserve existing confirmed facts unless current code contradicts them.\n- Record uncertainty, assumptions, and gaps in the Open questions section, not as fact.\n- Never author, paste, or hand-edit fingerprints or `codebase-index.json`.\n\nUpdate these files:\n- .specwright/project/scan.md\n- .specwright/project/tech-stack.md\n- .specwright/project/architecture.md\n- .specwright/project/codebase-map.md\n\nDiscovery instructions:\n- Use file discovery (find) to identify top-level structure.\n- Use search and LSP when available to locate entrypoints, exported commands, runtime adapters, config defaults, validators, and tests.\n- Read only relevant sections; do not load full packs or unrelated documentation.\n\nSubagent fallback:\n- If delegated read-only mapping work fails, cancels, returns null, or returns an unusable report, retry the same assignment once with the default task agent using the same bounded/no-project-wide-command constraints.\n- Record the retry in .specwright/project/scan.md under Open questions.\n- Do not declare blocked until the retry also fails or the missing fact is not available through tools."
}
```

Exit status: 0.

### Fingerprint spot check

Command:
```
sha256sum src/core/codebase-index.ts test/core-commands.test.ts test/core-validators.test.ts && stat -c '%n %s' src/core/codebase-index.ts test/core-commands.test.ts test/core-validators.test.ts
```

Output:
```
e6bcbe31d54d76ff39cf0e5e8ddbe162099c43caea9b6e45a659cba62feb26de  src/core/codebase-index.ts
00114cb62607e385ea589168e4619334ed25d7b0fcdb98aaf66a833392b010e8  test/core-commands.test.ts
7827279ae1a594bece984d6c27568dea5f9c7a81e3f9a54d23446e758d1180d2  test/core-validators.test.ts
src/core/codebase-index.ts 29827
test/core-commands.test.ts 189394
test/core-validators.test.ts 19684
```

Exit status: 0.

Index comparison:

- `.specwright/project/codebase-index.json` fingerprint for `src/core/codebase-index.ts`: size `29827`, checksum `e6bcbe31d54d76ff39cf0e5e8ddbe162099c43caea9b6e45a659cba62feb26de`.
- `.specwright/project/codebase-index.json` fingerprint for `test/core-commands.test.ts`: size `189394`, checksum `00114cb62607e385ea589168e4619334ed25d7b0fcdb98aaf66a833392b010e8`.
- `.specwright/project/codebase-index.json` fingerprint for `test/core-validators.test.ts`: size `19684`, checksum `7827279ae1a594bece984d6c27568dea5f9c7a81e3f9a54d23446e758d1180d2`.


## Next task

No incomplete tasks.

## Evidence

# Evidence

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local evidence

### Pre-change baseline

- Before this change, `commandScan()` ensured project prose artifacts, wrote an empty deterministic-index shell, and treated refresh stale detection as an agent-facing prompt concern.
- The old refresh contract made `codebase-index.json` partly agent-owned by asking the agent to provide checksum JSON.
- `validateCodebaseIndex()` already distinguished hard shape/path/fingerprint errors from missing-file warnings, which supported scratch rebuilds for poisoned indexes.
- Prompt tests already enforced runtime-neutral core scan wording and isolated OMP-specific scout guidance.

### Implemented branch evidence

- `buildCodebaseIndex()` in `src/core/codebase-index.ts:505-776` builds the deterministic index from Git-assisted streaming or filesystem discovery, filters unsafe/excluded paths, enforces caps for associated tests, and reports deleted indexed files as stale.
- Discovery in `src/core/codebase-index.ts:205-325` rejects unsafe Git and filesystem paths before indexing and records deterministic `unsafe path skipped` risks.
- `commandScan()` in `src/core/commands.ts:517-627` calls the builder every scan, validates generated output before writing, and exposes generated validation separately from existing-index validation.
- `renderScanPrompt()` in `src/core/prompts.ts:125-200` makes `codebase-index.json` command-owned, derives the editable prose artifact list from scan mode, and renders all stale files during refresh.
- `renderOmpScanPrompt()` in `src/runtime/omp/prompts.ts:34-49` keeps OMP scout instructions but restricts scout merges to agent-owned prose artifacts.
- Regression coverage in `test/core-commands.test.ts:2571-2623,2812-2864` (invalid-index rebuilds), `test/core-commands.test.ts:3004-3745` (discovery, caps, unsafe paths, fingerprints, association, Git, sort order), `test/core-commands.test.ts:3172-3195` (stale file detection), `test/core-commands.test.ts:3303-3335` (package entrypoint filtering), `test/core-commands.test.ts:3444-3491` (test association and ambiguous basename fallback), and `test/core-prompts.test.ts:370-572` (prompt ownership) covers invalid rebuilds, stale file detection, package path filtering, unsafe discovered paths, Git discovery caps, associated-test caps, ambiguous basename fallback, and prompt ownership.
## Research attempts

No external or scout research was required; local code and tests provide enough evidence. The `specwright-researcher` attempted to update the research artifacts directly, but its environment did not expose a file-write/edit tool, so it returned proposed contents for the lifecycle orchestrator to apply.

## Decisions supported

- Keep deterministic index generation command-owned for both plain scan and `--map`.
- Refuse to write generated indexes that fail validation.
- Filter package entrypoints before insertion instead of repairing unsafe paths after the fact.
- Count associated tests against the indexed-file cap and avoid ambiguous basename fallback.
- Keep OMP scout merges prose-only while allowing scouts to read `codebase-index.json` as evidence.


