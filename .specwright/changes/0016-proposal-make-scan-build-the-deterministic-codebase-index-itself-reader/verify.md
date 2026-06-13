# Verification

## Result

PASS

## Issues

No issues.

## Observed output

Observed commands and outputs follow.

### Focused behavior checks

Command:
```
bun test test/core-commands.test.ts -t "buildCodebaseIndex deduplicates package and inferred entrypoints before cap accounting"
```

Output:
```
Test Results:
   PASS: 1 passed
```

Exit status: 0.

Command:
```
bun test test/core-commands.test.ts -t "buildCodebaseIndex reports stale when a fingerprinted file becomes oversized"
```

Output:
```
Test Results:
   PASS: 1 passed
```

Exit status: 0.

Command:
```
bun test test/core-commands.test.ts -t "buildCodebaseIndex ignores root package metadata excluded by Git discovery"
```

Output:
```
Test Results:
   PASS: 1 passed
```

Exit status: 0.

Command:
```
bun test test/core-commands.test.ts -t "buildCodebaseIndex keeps fingerprints stable when only filesystem mtime changes"
```

Output:
```
Test Results:
   PASS: 1 passed
```

Exit status: 0.

Command:
```
bun test test/core-prompts.test.ts -t "renderOmpScanPrompt"
```

Output:
```
Test Results:
   PASS: 3 passed
```

Exit status: 0.

Command:
```
bun test test/omp-extension.test.ts -t "OMP runtime scan prompt includes parallel scout map guidance"
```

Output:
```
Test Results:
   PASS: 1 passed
```

Exit status: 0.

### Targeted file suites

Command:
```
bun test test/core-commands.test.ts test/core-prompts.test.ts test/omp-extension.test.ts
```

Output:
```
Test Results:
   PASS: 220 passed
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


Wall time: 1.12 seconds
```

Exit status: 0.

### Regenerated deterministic index

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

Command:
```
bun -e 'const idx=await Bun.file(".specwright/project/codebase-index.json").json(); const bad=Object.entries(idx.fingerprints ?? {}).filter(([, fp]) => fp.mtime !== 0); if (bad.length) { console.error(bad); process.exit(1); }'
```

Output:
```
(no output)
```

Exit status: 0.
