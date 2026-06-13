# Tech Stack

## Runtime

- Bun for CLI execution, package scripts, and tests (`package.json:9-13`).
- Published `specwright` bin is a Node wrapper that shells to Bun and exits with a Bun-missing error on `ENOENT` (`bin/specwright.mjs:1-23`).
- TypeScript targeting ES2022 modules (`tsconfig.json:2-17`).
- Node/Bun standard libraries for filesystem, path, child process, crypto/checksum, and URL operations.

## Package and commands

- Package: `specwright` (`package.json:1-8`), ESM (`"type": "module"`).
- CLI script: `bun src/cli.ts` via `bun run specwright` (`package.json:9-13`).
- Bin wrapper: `bin/specwright.mjs`, exposed as `specwright`, launches Bun (`package.json:6-8`, `bin/specwright.mjs:10-17`).
- Test command: `bun test`.
- Typecheck command: `tsc --noEmit`.
- Combined check: `bun test && tsc --noEmit`.

## Dependencies

- Runtime dependencies: none.
- Dev dependencies (`package.json:15-20`):
  - `@types/bun`
  - `typescript`
  - `typescript-language-server`
  - `vscode-langservers-extracted`

## TypeScript settings

- `target: "ES2022"`, `module: "ESNext"`, `moduleResolution: "Bundler"` (`tsconfig.json:2-6`).
- `lib: ["ES2022"]`, `types: ["bun-types"]` (`tsconfig.json:6-7`).
- Strict mode plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, and `useUnknownInCatchVariables` (`tsconfig.json:8-12`).
- `allowImportingTsExtensions: true`, `noEmit: true` (`tsconfig.json:14-15`).
- Includes `src/**/*.ts` and `test/**/*.ts` (`tsconfig.json:17`).

## Test stack

- `bun:test`.
- Tests create temporary directories and exercise real file reads/writes.
- Current coverage areas: init layout, change creation, decisions artifact, prompt generation, validators, task drift, config, scan/index refresh, checkpoint/complete/publish behavior, Git/GH helpers, and OMP extension/status/tools/install behavior.

## Runtime integration

- Initial runtime target: OMP only.
- OMP extension source: `src/runtime/omp/extension.ts`.
- Project-local OMP install output (`src/runtime/omp/install.ts:150-187`):
  - `.omp/extensions/specwright/package.json`
  - `.omp/extensions/specwright/index.ts`
  - `.omp/agents/specwright-*.md`
  - `.omp/rules/specwright-workflow.md`
- OMP adapter surface uses structural local types, not imported OMP runtime types (`src/runtime/omp/types.ts`).
