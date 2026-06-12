# Verification

## Result

PASS

## Issues

No issues.

## Observed output

### Review regression guard — status UI contract

Command:

```bash
bun test test/core-commands.test.ts -t "status syncs task artifact changes before rendering progress"
```

Observed output:

```text
Test Results:
   PASS: 1 passed
```

### T001 — Parse scan map flags

Command:

```bash
bun test test/core-commands.test.ts -t "scan"
```

Observed output:

```text
Test Results:
   PASS: 15 passed
```

### T002 — Ensure map artifacts

Command:

```bash
bun test test/core-commands.test.ts -t "scan"
```

Observed output:

```text
Test Results:
   PASS: 15 passed
```

### T003 — Compare refresh fingerprints

Commands:

```bash
bun test test/core-commands.test.ts -t "scan --refresh"
bun test test/core-commands.test.ts -t "scan"
```

Observed output:

```text
Test Results:
   PASS: 4 passed

Test Results:
   PASS: 15 passed
```

### T004 — Render core map prompts

Commands:

```bash
bun test test/core-prompts.test.ts -t "ScanPrompt"
bun test test/core-commands.test.ts -t "scan"
```

Observed output:

```text
Test Results:
   PASS: 5 passed

Test Results:
   PASS: 15 passed
```

### T005 — Add OMP map guidance

Commands:

```bash
bun test test/omp-extension.test.ts -t "scan prompt"
bun test test/core-prompts.test.ts -t "ScanPrompt"
```

Observed output:

```text
Test Results:
   PASS: 2 passed

Test Results:
   PASS: 5 passed
```

### T006 — Validate codebase index

Commands:

```bash
bun test test/core-validators.test.ts -t "validateCodebaseIndex"
bun test test/core-commands.test.ts -t "scan"
```

Selected validator coverage:

- `validateCodebaseIndex reports invalid version and shape errors`
- `validateCodebaseIndex reports unsafe and absolute paths`
- `validateCodebaseIndex reports missing required fields`
- `validateCodebaseIndex warns when listed paths do not exist`
- `validateCodebaseIndex treats ENOTDIR as a missing indexed path`
- `validateCodebaseIndex rejects control-character paths without statting them`

Observed output:

```text
Test Results:
   PASS: 6 passed

Test Results:
   PASS: 15 passed
```

### T007 — Point lifecycle prompts at maps

Commands:

```bash
bun test test/core-commands.test.ts -t "map pointer"
bun test test/core-commands.test.ts -t "map reference"
```

Observed output:

```text
Test Results:
   PASS: 4 passed

Test Results:
   PASS: 1 passed
```

### Typecheck

Command:

```bash
bun run typecheck
```

Observed output:

```text
$ tsc --noEmit
```

### Final Specwright validation

Command:

```bash
bun src/cli.ts verify 0015-proposal-extend-specwright-scan-with-a-codebase-map-reader-internal
```

Observed output:

```text
Specwright validators passed.
```
