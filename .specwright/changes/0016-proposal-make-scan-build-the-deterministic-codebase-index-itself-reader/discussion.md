# Discussion

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Conversation notes

- 2026-06-13: Read prepared artifacts and bounded evidence for scan/index behavior.
- Source request is embedded in `intent.md` under `@localdocs/SCAN-SEAMLESS-DETERMINISTIC-INDEX-PROPOSAL.md`.
- Pre-change scan code created `codebase-index.json` as an empty object-shaped artifact and only computed refresh fingerprints when `--refresh` was passed.
- Pre-change scan tests asserted `--map` created map/index artifacts without scan prose and that stale refresh printed an agent-authored fingerprint block while leaving `codebase-index.json` unchanged.
- Prompt tests enforced runtime-neutral core scan wording and kept OMP scout guidance in `renderOmpScanPrompt`.

## Open questions

- None after discussion checkpoint.

## Settled decisions

### `--map` semantics
- Question: should `specwright scan --map` retain a distinct focused behavior after the deterministic builder lands?
- Settled answer: keep `--map` as a focused prose-artifact compatibility mode; do not maintain a separate deterministic index path.
- Source evidence: `commandScan()` branches prose artifact creation on `args.map`, while deterministic index generation is shared through `buildCodebaseIndex()`.

### Invalid index handling
- Question: should scan preserve any semantic fields from an invalid existing `codebase-index.json`?
- Settled answer: rebuild deterministic data only when hard validation errors exist; do not preserve semantic fields from invalid objects.
- Source evidence: pre-change validation skipped semantic preservation on hard validation failures; current regression tests cover unsafe paths, malformed modules, and malformed fingerprints.

### Discovery and caps
- Question: should the first deterministic builder use filesystem-only discovery or git-assisted discovery?
- Settled answer: use git-assisted discovery when available, with a deterministic filesystem fallback so non-Git projects still index correctly.
- Source evidence: the pre-change implementation did not build an index from discovery, so the new builder owns this policy.

### Prompt contract
- Question: should agents ever author or paste fingerprints?
- Settled answer: never; prompts may report deterministic index status but must not ask agents to author fingerprints.
- Source evidence: the pre-change refresh prompt asked the agent to paste fingerprint JSON, while prompt tests already enforced the core/OMP boundary.

