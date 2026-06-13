# Options

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Option 1: Full command-owned index on every scan (recommended)

Implement `src/core/codebase-index.ts` with the shared `CodebaseIndex` type, a filesystem walker, file classifier, streaming SHA-256 fingerprint helper, and `buildCodebaseIndex()`. `commandScan()` always runs the builder after ensuring project artifacts, writes `codebase-index.json` only when `changed` or `--force`, and returns `indexUpdated`, `staleFiles`, `scannedFiles`, `indexedFiles`, and `truncated` in the JSON payload. The scan prompt drops the fingerprint JSON contract and instead shows a deterministic summary. `--refresh` becomes a compatibility alias for the same builder path. `--map` still triggers the builder because the index is command-owned, and the existing `--map --force` test is updated to expect the index update.

Tradeoffs:
- Clean ownership boundary; agents never author fingerprints.
- Slightly larger initial implementation because the builder must classify files and extract package scripts/entrypoints/tests.
- Prompt and test changes are broader but match the intent.

## Option 2: Lazy builder that only runs on missing/stale/refresh/force

Keep `compareRefreshFingerprints()` for quick fingerprint diffing and add a separate discovery pass that only runs when the index is missing, validation fails, `--refresh` is set, or `--force` is set. This defers deterministic index population until it is known to be needed.

Tradeoffs:
- Smaller immediate diff; reuses more existing refresh logic.
- Blurs the ownership boundary because `--map` or plain scan might leave an empty index unless forced.
- Harder to make idempotent second scans observable and seamless; the prompt must still explain when/why the index was or was not rebuilt.
- Conflicts with the intent that plain `specwright scan` should keep the index current.

## Recommendation

Adopt Option 1. It matches the intent, constraints, and acceptance criteria: plain scan is the primary UX, the index is always command-owned, fingerprints are never agent-authored, and the second-scan idempotency test (`indexUpdated: false`) is straightforward to verify. Git-assisted discovery can be added later as an optimization inside `buildCodebaseIndex()` without changing the command flow.

