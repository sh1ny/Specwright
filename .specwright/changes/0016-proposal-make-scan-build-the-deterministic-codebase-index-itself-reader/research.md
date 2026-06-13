# Research

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local findings

### Pre-change baseline

- Before this change, `specwright scan` ensured prose project artifacts and created an object-shaped `codebase-index.json`; refresh behavior only considered paths already recorded in the existing index.
- The old refresh prompt made `codebase-index.json` partly agent-owned by asking the agent to copy checksum JSON into the artifact.
- Existing validation separated hard shape/path/fingerprint errors from missing-file warnings; this change rebuilds deterministic data from scratch on hard errors and does not preserve semantic fields from invalid indexes.
- Prompt tests already protected the core/OMP boundary, so OMP scout wording had to remain in `src/runtime/omp/prompts.ts`.

### Implemented branch evidence

- `src/core/codebase-index.ts:205-325` streams Git-assisted discovery and falls back to deterministic filesystem recursion; both paths reject unsafe paths before indexing.
- `src/core/codebase-index.ts:347-394`, `src/core/codebase-index.ts:418-455`, and `src/core/codebase-index.ts:505-776` own safe package entrypoint filtering, nearest-path test association, cap accounting, resilient fingerprinting, and `buildCodebaseIndex()`.
- `src/core/commands.ts:517-627` runs the builder on scan, validates the generated index before writing, fails closed on generated validation errors, and exposes both existing-index and generated-index validation in JSON output.
- `src/core/prompts.ts:125-200` renders deterministic scan state, keeps `.specwright/project/codebase-index.json` command-owned, and renders every stale file in refresh mode.
- `src/runtime/omp/prompts.ts:34-49` keeps OMP scout guidance but restricts merging to agent-owned prose artifacts while reading the index for confirmed facts.
- `test/core-commands.test.ts:2757-2814` covers invalid-index rebuilds with live data; `test/core-commands.test.ts:2949-3491` covers discovery, caps, unsafe paths, fingerprints, association, Git, and sort order.
- `test/core-prompts.test.ts:370-570` covers default/map ownership lines, stale-file rendering, and OMP prose-only merge guidance.
## External findings

None. All evidence is local; no online research was required.

## Implications

- `specwright scan` is the sole writer for deterministic index data; agents only edit prose artifacts.
- Generated indexes are validated before persistence, so unsafe builder output is rejected instead of written.
- `--map` remains focused for prose artifacts but shares the same command-owned deterministic index path as plain scan.
- Tests now cover path safety, cap accounting, deleted-file stale reporting, prompt ownership, and generated-index validation boundaries.

