# Research

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local findings

- The repository is now a Bun/TypeScript kernel with no runtime dependencies beyond Bun/Node stdlib. `package.json` exposes `bun src/cli.ts`, `bun test`, `tsc --noEmit`, and a `specwright` bin wrapper.
- The command engine in `src/core/commands.ts` implements the requested lifecycle commands locally: `init`, `status`, `scan`, `new`, `discuss`, `research`, `plan`, `tasks`, `execute`, `verify`, `handoff`, and local `pack` operations.
- `init` creates `.specwright` project/state/cache/tmp/change/pack directories, copies the built-in `packs/core`, creates project charter/principle/glossary/tech-stack/architecture stubs, and installs the OMP adapter.
- Research, scan, and planning commands are prompt-producing file workflow steps, not model clients. This matches the product constraint that CLI should create artifacts/prompts while OMP injects prompts into the active agent session.
- Deterministic validators exist in `src/core/validators.ts` and currently cover missing intent, missing evidence, required online sources, duplicate task IDs, missing tasks before execute, missing task acceptance/verification blocks, plan evidence citations, and missing observed output after all tasks are checked done.
- The OMP adapter is project-local: `.omp/extensions/specwright/package.json` points to `index.ts`, `index.ts` re-exports `src/runtime/omp/extension`, and `.omp/rules/specwright-workflow.md` makes Specwright artifacts source-of-truth when `.specwright/` exists.
- Tests cover init layout, change creation, research prompt policy/fallback text, duplicate task validation, and OMP slash-command registration/status behavior.
- Current gap: `intent.md` is still empty inside the frozen human-owned block, so `verify --json` correctly fails with `SW001` before planning/execution should be considered complete.

## External findings

- No external lookup was needed for this research pass. `online=auto` permits web search when APIs, dependencies, standards, errors, competitors, or recent behavior matter; this change is currently constrained by local implementation and observed local OMP adapter wiring.

## Implications

- Next planning should focus on hardening the just-built kernel rather than designing a new architecture from scratch.
- The highest-value next tasks are likely: fill approved intent/constraints, fix any type/test gaps discovered during continued dogfooding, tighten command edge cases, and decide whether to add an OMP load smoke test that is reliable in non-interactive CI.
- Keep runtime-specific behavior behind `src/runtime/omp/*`; new runtime adapters should not be added until the OMP path is dogfooded.

