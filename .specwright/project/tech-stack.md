# Tech Stack

## Runtime

- Bun for CLI execution and tests.
- TypeScript targeting ES2022 modules.
- Node/Bun standard library for filesystem, path, child process, and URL operations.

## Package and commands

- Package: `specwright` (`package.json:1-8`).
- CLI script: `bun src/cli.ts` via `bun run specwright`.
- Bin wrapper: `bin/specwright.mjs`, which launches Bun and prints a clear error if Bun is missing.
- Test command: `bun test`.
- Typecheck command: `tsc --noEmit`.
- Combined check: `bun test && tsc --noEmit`.

## Dependencies

- Runtime dependencies: none.
- Dev dependencies:
  - `typescript`
  - `@types/bun`

## TypeScript settings

- Strict mode enabled.
- `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, and `useUnknownInCatchVariables` enabled.
- `moduleResolution: "Bundler"`.
- `allowImportingTsExtensions: true`.
- `noEmit: true`.

## Test stack

- `bun:test`.
- Tests create temporary directories and exercise real file writes/reads.
- Current coverage areas: init layout, change creation, decisions artifact, prompt generation, validators, command flag parsing, OMP extension registration, OMP adapter install files.

## Runtime integration

- Initial runtime target: OMP only.
- OMP extension source: `src/runtime/omp/extension.ts`.
- Project-local OMP install output:
  - `.omp/extensions/specwright/package.json`
  - `.omp/extensions/specwright/index.ts`
  - `.omp/agents/specwright-*.md`
  - `.omp/rules/specwright-workflow.md`