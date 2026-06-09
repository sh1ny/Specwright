# Project Scan

## Last scanned

- 2026-06-08

## Files inspected

- `package.json:1-19` — package metadata, Bun scripts, CLI bin, dev dependencies.
- `tsconfig.json:1-18` — strict TypeScript compiler configuration.
- `src/core/types.ts` — core domain types, lifecycle steps, config/state shapes, runtime adapter contract.
- `src/core/commands.ts` — command engine for init/status/scan/new/discuss/research/plan/tasks/execute/verify/handoff/pack.
- `src/core/state.ts` — config/state defaults, loading, saving, current-change lookup.
- `src/core/validators.ts` — deterministic validation rules and verification report rendering.
- `src/core/prompts.ts` — context-budget and subagent fallback prompt fragments.
- `src/runtime/omp/*.ts` — OMP install, extension registration, status rendering, argument splitting, structural OMP API types.
- `packs/core/pack.json:1-33` and `packs/core/workflows/feature.json:1-50` — built-in core pack manifest and workflow modes.
- `test/*.test.ts` — Bun test coverage for init, new/discuss artifacts, prompts, validators, command flags, and OMP adapter behavior.

## Patterns found

- Specwright is a small Bun/TypeScript workflow kernel, not a framework with runtime services.
- Machine state lives in JSON under `.specwright/config.json` and `.specwright/state.json`; human/change artifacts are Markdown under `.specwright/changes/<id>-<slug>/`.
- The command engine is deterministic. It creates/updates artifacts, validates state, and returns prompts; it does not call AI models directly.
- OMP is the only implemented runtime. Project-local installation writes `.omp/extensions/specwright`, `.omp/agents/specwright-*.md`, and `.omp/rules/specwright-workflow.md`.
- Packs are local file trees. The built-in `core` pack defines artifacts, one `feature` workflow, four agent cards, and deterministic validator IDs.
- Validators run before verification/handoff claims and catch missing intent/evidence, required-source issues, duplicate tasks, missing task acceptance/verification blocks, and missing observed output after all tasks are done.
- Tests use `bun:test` and temporary directories; no mocks or runtime dependencies are required.
- No language server was configured for this project during scan.

## Constraints

- Keep Bun/TypeScript as the current runtime.
- Avoid runtime dependencies; current package only has TypeScript/Bun dev dependencies.
- Keep runtime-specific behavior under `src/runtime/omp/*`.
- Keep CLI deterministic and prompt-producing; no direct model/web client calls in CLI.
- Keep prompts low-token by listing only current step artifacts and explicit files.
- Do not add non-OMP runtime adapters or remote pack registries until OMP/core are dogfooded further.

## Open questions

- Should `scan` eventually update `charter.md`, `principles.md`, or `glossary.md`, or should those remain explicitly human-owned?
- Should project-level scan output include a stale-assumptions section to make repeated scans safer?
- Should process-level OMP extension loading get a stable automated smoke test, or remain a manual check because OMP CLI behavior is environment-sensitive?
