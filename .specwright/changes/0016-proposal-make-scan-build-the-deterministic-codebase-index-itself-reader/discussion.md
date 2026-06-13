# Discussion

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Conversation notes

- 2026-06-13: Read prepared artifacts and bounded evidence for scan/index behavior.
- Source request is embedded in `intent.md` under `@localdocs/SCAN-SEAMLESS-DETERMINISTIC-INDEX-PROPOSAL.md`.
- Current scan code creates `codebase-index.json` as an empty object-shaped artifact and only computes refresh fingerprints when `--refresh` is passed (`src/core/commands.ts:625-662`).
- Current scan tests assert `--map` creates map/index artifacts without scan prose and that stale refresh prints `## Current fingerprints` while leaving `codebase-index.json` unchanged (`test/core-commands.test.ts:2509-2728`).
- Current prompt tests enforce runtime-neutral core scan wording and keep OMP scout guidance in `renderOmpScanPrompt` (`test/core-prompts.test.ts:417-440`).

## Open questions

- None after discussion checkpoint.

## Settled decisions

### `--map` semantics
- Question: should `specwright scan --map` retain a distinct focused behavior after the deterministic builder lands?
- Settled answer: deprecate separate `--map` behavior; keep it as compatibility spelling with no separate semantics.
- Source evidence: `commandScan()` currently branches artifact creation on `args.map` (`src/core/commands.ts:604-615`), and tests encode map-only artifact expectations (`test/core-commands.test.ts:2509-2526`, `test/core-commands.test.ts:2571-2599`).

### Invalid index handling
- Question: should scan preserve any semantic fields from an invalid existing `codebase-index.json`?
- Settled answer: rebuild deterministic data only when hard validation errors exist; do not preserve semantic fields from invalid objects.
- Source evidence: refresh currently skips comparison when validation fails (`src/core/commands.ts:651-655`) and tests cover unsafe paths, malformed modules, and malformed fingerprints (`test/core-commands.test.ts:2736-2810`).

### Discovery and caps
- Question: should the first deterministic builder use filesystem-only discovery or git-assisted discovery?
- Settled answer: use git-assisted discovery when available, with a deterministic filesystem fallback so non-Git projects still index correctly.
- Source evidence: current implementation does not build an index from discovery at all; it writes empty arrays (`src/core/commands.ts:625-635`), so the new builder owns this policy.

### Prompt contract
- Question: should agents ever author or paste fingerprints?
- Settled answer: never; prompts may report deterministic index status but must not ask agents to author fingerprints.
- Source evidence: current refresh prompt asks the agent to paste `## Current fingerprints` (`src/core/commands.ts:657-662`), while prompt tests already enforce the core/OMP boundary (`test/core-prompts.test.ts:417-440`).

