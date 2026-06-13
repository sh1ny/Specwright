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

