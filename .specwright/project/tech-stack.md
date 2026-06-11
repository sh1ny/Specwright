# Tech Stack

## Runtime

- Bun for CLI execution, package scripts, and tests.
- TypeScript targeting ES2022 modules.
- Node/Bun standard libraries for filesystem, path, child process, and URL operations.

## Package and commands

- Package: `specwright` (`package.json:1-8`), ESM (`"type": "module"`).
- CLI script: `bun src/cli.ts` via `bun run specwright`.
- Bin wrapper: `bin/specwright.mjs`, exposed as `specwright`, launches Bun and reports a Bun-missing error.
- Test command: `bun test`.
- Typecheck command: `tsc --noEmit`.
- Combined check: `bun test && tsc --noEmit`.

## Dependencies

- Runtime dependencies: none.
- Dev dependencies:
  - `@types/bun`
  - `typescript`
  - `typescript-language-server`
  - `vscode-langservers-extracted`

## TypeScript settings

- `target: "ES2022"`, `module: "ESNext"`, `moduleResolution: "Bundler"`.
- `lib: ["ES2022"]`, `types: ["bun-types"]`.
- Strict mode enabled.
- `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, and `useUnknownInCatchVariables` enabled.
- `allowImportingTsExtensions: true`.
- `noEmit: true`.
- Includes `src/**/*.ts` and `test/**/*.ts`.

## Test stack

- `bun:test`.
- Tests create temporary directories and exercise real file reads/writes.
- Current coverage areas: init layout, change creation, decisions artifact, prompt generation, validators, command/config/publish behavior, OMP extension registration/status/tools/install behavior.

## Runtime integration

- Initial runtime target: OMP only.
- OMP extension source: `src/runtime/omp/extension.ts`.
- Project-local OMP install output:
  - `.omp/extensions/specwright/package.json`
  - `.omp/extensions/specwright/index.ts`
  - `.omp/agents/specwright-*.md`
  - `.omp/rules/specwright-workflow.md`