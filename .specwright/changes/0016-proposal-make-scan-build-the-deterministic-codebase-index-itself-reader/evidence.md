# Evidence

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local evidence

### Pre-change baseline

- Before this change, `commandScan()` ensured project prose artifacts, wrote an empty deterministic-index shell, and treated refresh stale detection as an agent-facing prompt concern.
- The old refresh contract made `codebase-index.json` partly agent-owned by asking the agent to provide checksum JSON.
- `validateCodebaseIndex()` already distinguished hard shape/path/fingerprint errors from missing-file warnings, which supported scratch rebuilds for poisoned indexes.
- Prompt tests already enforced runtime-neutral core scan wording and isolated OMP-specific scout guidance.

### Implemented branch evidence

- `buildCodebaseIndex()` in `src/core/codebase-index.ts:454-715` now builds the deterministic index from Git-assisted or filesystem discovery, filters unsafe/excluded package entrypoints, enforces caps for associated tests, and reports deleted indexed files as stale.
- `commandScan()` in `src/core/commands.ts:517-624` calls the builder every scan, validates generated output before writing, and exposes generated validation separately from existing-index validation.
- `renderScanPrompt()` in `src/core/prompts.ts:125-192` makes `codebase-index.json` command-owned and derives the editable prose artifact list from the scan mode.
- `renderOmpScanPrompt()` in `src/runtime/omp/prompts.ts:34-47` keeps OMP scout instructions but restricts scout merges to agent-owned prose artifacts.
- Regression coverage in `test/core-commands.test.ts:2732-3137` and `test/core-prompts.test.ts:370-512` covers invalid rebuilds, stale deletions, package path filtering, associated-test caps, ambiguous basename fallback, and prompt ownership.
## Research attempts

No external or scout research was required; local code and tests provide enough evidence. The `specwright-researcher` attempted to update the research artifacts directly, but its environment did not expose a file-write/edit tool, so it returned proposed contents for the lifecycle orchestrator to apply.

## Decisions supported

- Keep deterministic index generation command-owned for both plain scan and `--map`.
- Refuse to write generated indexes that fail validation.
- Filter package entrypoints before insertion instead of repairing unsafe paths after the fact.
- Count associated tests against the indexed-file cap and avoid ambiguous basename fallback.
- Keep OMP scout merges prose-only while allowing scouts to read `codebase-index.json` as evidence.

