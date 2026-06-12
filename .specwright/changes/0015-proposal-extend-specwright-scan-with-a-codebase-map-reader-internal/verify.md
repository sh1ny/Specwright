# Verification

## Result

PASS

## Issues

No issues.

## Observed output

### T001 — Parse scan map flags

Command: `bun test test/core-commands.test.ts -t "scan"`

```
Test Results:
   PASS: 15 passed
```

Covered tests:
- `scan accepts --map, --refresh, and combinations without treating them as unknown`
- `scan still rejects unknown flags`
- `help text advertises scan --map, --refresh, --force, and --json`

### T002 — Ensure map artifacts

Same command as T001: `bun test test/core-commands.test.ts -t "scan"` — `PASS: 15 passed`.

Covered tests:
- `scan ensures all project intelligence artifacts`
- `scan preserves existing map artifacts unless --force is used`
- `scan --force regenerates existing map artifacts`
- `scan --json returns accurate result shape`

### T003 — Compare refresh fingerprints

Same command as T001: `bun test test/core-commands.test.ts -t "scan"` — `PASS: 15 passed`.

Covered tests:
- `scan --refresh reports no stale files when fingerprints match`
- `scan --refresh reports deterministic stale warnings for changed and missing files`

### T004 — Render core map prompts

Command: `bun test test/core-prompts.test.ts -t "ScanPrompt"`

```
Test Results:
   PASS: 6 passed
```

Covered tests:
- `renderScanPrompt default mode lists all project intelligence files and bounded discovery`
- `renderScanPrompt map mode focuses only on map artifacts`
- `renderScanPrompt refresh mode includes patch-stale contract and section`
- `renderScanPrompt map+refresh mode focuses map artifacts and refresh contract`
- `renderScanPrompt is runtime-neutral and avoids OMP-specific scout wording`
- `renderOmpScanPrompt preserves refresh section and contract in refresh mode`

Command: `bun test test/core-commands.test.ts -t "scan"` — `PASS: 15 passed`.

Covered tests:
- `scan prompt references map artifacts`
- `scan --map prompt focuses only on map artifacts`
- `scan prompt through CLI is runtime-neutral without OMP references`
- `scan --refresh prompt includes refresh contract`

### T005 — Add OMP map guidance

Command: `bun test test/omp-extension.test.ts -t "scan prompt"`

```
Test Results:
   PASS: 2 passed
```

Covered tests:
- `OMP runtime scan prompt includes parallel scout map guidance`
- `CLI runtime scan prompt stays neutral without OMP map guidance`

Command: `bun test test/core-prompts.test.ts -t "CLI runtime prompts remain neutral without OMP references through command"`

```
Test Results:
   PASS: 1 passed
```

### T006 — Validate codebase index

Command: `bun test test/core-validators.test.ts -t "validateCodebaseIndex"`

```
Test Results:
   PASS: 4 passed
```

Covered tests:
- `validateCodebaseIndex accepts a valid version-1 index`
- `validateCodebaseIndex reports invalid version and shape errors`
- `validateCodebaseIndex reports unsafe and absolute paths`
- `validateCodebaseIndex reports missing required fields`
- `validateCodebaseIndex warns when listed paths do not exist`

Command: `bun test test/core-commands.test.ts -t "scan"` — `PASS: 15 passed`.

Covered tests:
- `scan surfaces validation issues for an invalid codebase-index.json`
- `scan --json surfaces validation issues without changing summary shape`

### T007 — Point lifecycle prompts at maps

Same command as T001: `bun test test/core-commands.test.ts -t "scan"` — `PASS: 15 passed`.

Covered tests:
- `research prompt includes map pointer when map artifacts exist`
- `research prompt omits map pointer when map artifacts are absent`
- `plan prompt includes map pointer when map artifacts exist`
- `plan prompt omits map pointer when map artifacts are absent`
- `execute prompt includes map reference path`
- `handoff prompt includes map pointer when no task is specified`
- `handoff prompt omits map pointer when task is specified`

## Source summary

- `src/core/commands.ts`: adds `scan` flag parsing for `--map`, `--refresh`, `--force`, and `--json`; ensures `scan.md`, `tech-stack.md`, `architecture.md`, `codebase-map.md`, and version-1 `codebase-index.json` under the project directory; computes file fingerprints and feeds stale/no-stale status into `scan --refresh`; wires optional map-pointer references into research, plan, execute, and handoff prompts.
- `src/core/prompts.ts`: adds `renderScanPrompt` for default, map-only, and refresh modes with bounded discovery instructions, map-artifact update contract, confirmed-fact preservation, uncertainty recording, and runtime-neutral wording; lifecycle prompts optionally cite `codebase-map.md` and `codebase-index.json` without inlining contents.
- `src/core/validators.ts`: adds `validateCodebaseIndex` enforcing valid JSON, `version: 1`, required object arrays, safe relative paths, listed file/test existence, and stale/missing-file warnings without blocking unrelated lifecycle validation.
- `src/core/json.ts`: adds `computeFileFingerprint` using mtime, size, and SHA-256 checksum; supports deterministic refresh comparison.
- `src/runtime/omp/prompts.ts`: adds `renderOmpScanPrompt` wrapping the core scan prompt with optional parallel/scout mapping guidance when running under OMP, preserving the core runtime-neutral contract.
