# Project Scan

## Last scanned

- 2026-06-13T15:02:23.528Z

## Sources inspected

- `package.json:1-21` — package metadata, Bun scripts, CLI bin, dev dependencies.
- `tsconfig.json:1-18` — ES2022/Bundler strict TypeScript compiler settings.
- `bin/specwright.mjs:1-23`, `src/cli.ts:1-26` — published wrapper and Bun CLI entrypoint.
- `src/core/commands.ts:48-77,264-374,517-627,1451-1486` — argument model, config keys, scan/index refresh support, dispatcher, command help.
- `src/core/codebase-index.ts` — command-owned deterministic codebase map builder; discovers files through Git or filesystem fallback, classifies entrypoints/modules/tests, derives package scripts, records risks, and fingerprints indexed files.
- `src/core/state.ts:57-87,124-279,299-421`, `src/core/types.ts:1-132`, `src/core/paths.ts:1-42` — defaults, lifecycle/domain types, task sync, config/state loading, path layout.
- `src/core/validators.ts:73-99,100-308,408-493` — config validation, codebase-index validation, change validation, validation report rendering.
- `src/runtime/omp/extension.ts:1-161`, `src/runtime/omp/install.ts:39-187`, `src/runtime/omp/status.ts:61-232` — OMP command/tools/hooks, generated adapter files, passive status behavior.
- `packs/core/pack.json:1-33`, `packs/core/workflows/feature.json:1-50`, `packs/core/validators/core.json:1-13` — built-in pack manifest, workflow modes, validator manifest.
- `test/*.test.ts` — bounded search of test names and scout summaries for covered behavior.
- LSP: TypeScript server available; `symbols` on `src/core/commands.ts` confirmed exported dispatcher and command handler locations.
- URLs: none used; this scan is based on local repository sources only.

## Patterns found

- Specwright remains a small file-based workflow kernel. The CLI owns deterministic artifact/state operations and prompt generation; it does not call models directly (`src/cli.ts:10-13`, `src/core/commands.ts:1451-1486`).
- The fixed lifecycle is `discuss -> research -> plan -> execute -> verify -> handoff` (`src/core/types.ts:4`, `packs/core/workflows/feature.json:5-12`).
- Machine state lives in `.specwright/config.json` and `.specwright/state.json`; change artifacts live under `.specwright/changes/<id>-<slug>/` (`src/core/paths.ts:4-25`).
- Task truth is Markdown checklist syntax in `tasks.md`; sync detects malformed lines, duplicate IDs, title drift, and cached tasks missing from artifacts (`src/core/state.ts:124-279`).
- `scan` without flags ensures the four agent-owned prose files — `.specwright/project/scan.md`, `.specwright/project/tech-stack.md`, `.specwright/project/architecture.md`, and `.specwright/project/codebase-map.md` — alongside the command-owned `.specwright/project/codebase-index.json`; it validates generated index data and emits a bounded prose-and-map update prompt (`src/core/commands.ts:517-627`, `src/core/prompts.ts:125-200`, `src/core/validators.ts:100-308`).
- `scan --map` is a prose-scope slice: it still rebuilds and validates `.specwright/project/codebase-index.json`, but it only ensures and prompts the agent to update `.specwright/project/codebase-map.md`. The JSON fingerprints and machine fields remain command-owned in both modes; agents summarize current index facts in prose and never paste or hand-edit JSON (`src/core/commands.ts:528-546`, `src/core/prompts.ts:174-200`).
- OMP is the only runtime integration. Runtime-specific code stays under `src/runtime/omp/*` and wraps the core command engine (`src/runtime/omp/extension.ts:24-61`).
- The OMP extension registers `/specwright`, tools (`specwright_status`, `specwright_checkpoint`, `specwright_validate`), passive status hooks, and a `tool_call` guard for lifecycle subagent routing (`src/runtime/omp/extension.ts:64-160`).
- Packs are local file trees. The built-in `core` pack defines 13 artifacts, one `feature` workflow, four lifecycle agent cards, and one validator set (`packs/core/pack.json:1-33`).
- Release-oriented commands include `publish` with `none|push|pr` and `complete` with `none|push|pr|merge` (`src/core/commands.ts:68-73,1451-1486`).
- Tests use `bun:test`, temporary directories, real file reads/writes, and direct calls to `runSpecwrightCommand`; coverage includes CLI commands, prompt rendering, validators, scan/index refresh, and OMP extension behavior.

## Constraints

- Keep Bun/TypeScript as the current implementation stack (`package.json:9-19`, `bin/specwright.mjs:10-17`).
- Avoid runtime dependencies unless a concrete feature requires them; the package currently has no runtime dependencies (`package.json:15-20`).
- Keep core runtime-neutral. OMP behavior belongs in `src/runtime/omp/*`.
- Keep CLI behavior deterministic and prompt-producing.
- Keep project scans bounded: do not load full packs or unrelated docs.
- Preserve the file ownership model: human/model-editable Markdown artifacts, CLI-owned JSON cache, and command-owned codebase-index fingerprints.
- `codebase-index.json` paths must be safe relative paths and fingerprints must be `{mtime,size,checksum}` objects (`src/core/validators.ts:278-299`).

## Open questions

- `packs/core/validators/core.json` lists `SW001` through `SW008`, while `src/core/validators.ts` also emits `SW009` for task drift. Should the pack manifest be updated to advertise `SW009`?
- Should `.omp/` generated files be indexed as tracked runtime surface, or should the index prefer only source files that generate them?
- Should repeated scans record stale-assumption deltas instead of replacing the full project scan summary?
- No scout retry was required in this scan; all five read-only subsystem scouts completed with usable reports.
