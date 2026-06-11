# Project Scan

## Last scanned

- 2026-06-11

## Sources inspected

- `package.json:1-21` — package metadata, Bun scripts, CLI bin, dev dependencies.
- `tsconfig.json:1-18` — ES2022/Bundler strict TypeScript compiler settings.
- `src/core/types.ts:1-170` — lifecycle constants, status/config/state/task/pack/runtime types.
- `src/core/commands.ts` — command dispatcher and handlers for `init`, `status`, `scan`, `new`, `discuss`, `research`, `plan`, `tasks`, `execute`, `verify`, `checkpoint`, `handoff`, `pack`, `config`, and `publish`.
- `src/core/state.ts`, `src/core/validators.ts`, `src/core/prompts.ts`, `src/core/git.ts`, `src/core/paths.ts` — state/task sync, validation, prompt rendering, git/GitHub helpers, path layout.
- `src/runtime/omp/*.ts` — OMP extension registration, tool-call guard, status refresh, adapter installer, prompt clauses, args/types.
- `packs/core/pack.json`, `packs/core/workflows/feature.json`, targeted pack metadata only — built-in artifacts, feature workflow, agents, validators.
- `test/*.test.ts` — Bun tests for init/new/prompts/validators/commands/OMP extension behavior.
- LSP: TypeScript/JSON/HTML/CSS servers are configured; TypeScript symbols were available for `src/core/commands.ts`.
- URLs: none used; this scan is based on local repository sources only.

## Patterns found

- Specwright is a small file-based workflow kernel. The CLI owns deterministic artifact/state operations and emits prompts; it does not call models directly.
- The fixed lifecycle is `discuss -> research -> plan -> execute -> verify -> handoff`.
- Machine state lives in `.specwright/config.json` and `.specwright/state.json`; change artifacts live under `.specwright/changes/<id>-<slug>/`.
- Task truth is Markdown checklist syntax in `tasks.md`; task sync detects malformed lines, duplicate IDs, title drift, and cached tasks missing from artifacts as `SW009`.
- OMP is the only runtime integration. Runtime-specific code stays under `src/runtime/omp/*` and wraps the core command engine.
- The OMP extension registers `/specwright`, structured tools (`specwright_status`, `specwright_checkpoint`, `specwright_validate`), status/notification refresh hooks, and a `tool_call` guard for lifecycle subagent routing.
- Packs are local file trees. The built-in `core` pack defines artifact templates, one `feature` workflow, four lifecycle agent cards, and validator metadata.
- Publish support is implemented as `specwright publish [<change>] [--mode none|push|pr]`, with Git/GitHub helpers for branch push and PR body generation.
- Tests use `bun:test`, temporary directories, and real file writes/reads; no runtime dependencies are declared.

## Constraints

- Keep Bun/TypeScript as the current implementation stack.
- Avoid runtime dependencies unless a concrete feature requires them; the package currently has only dev dependencies.
- Keep core runtime-neutral. OMP behavior belongs in `src/runtime/omp/*`.
- Keep CLI behavior deterministic and prompt-producing.
- Keep project scans bounded: do not load full packs or unrelated docs.
- Preserve the file ownership model: human/model-editable Markdown artifacts, CLI-owned JSON cache.

## Open questions

- Should `scan` update only scan/tech/architecture, or should project-level `charter.md`, `principles.md`, and `glossary.md` get an explicit human-owned refresh workflow?
- Should repeated scans record stale-assumption deltas instead of replacing the full project scan summary?
- Should OMP extension loading get an automated smoke test against the real `omp` CLI, or remain covered by adapter/unit tests because local OMP behavior is environment-sensitive?
