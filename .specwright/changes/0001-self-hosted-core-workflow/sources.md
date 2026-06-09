# Sources

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## URLs

- None used. `online=auto` did not require external research for this local implementation pass.

## Local references

- `package.json:1-19` — Bun/TypeScript package metadata, scripts, and dependency surface.
- `src/core/commands.ts:208-247` — `init`, `status`, and `scan` behavior.
- `src/core/commands.ts:351-448` — lifecycle prompt generation, task parsing/execution prompt, and validator-first verify behavior.
- `src/core/validators.ts:89-162` — deterministic validation rules and Markdown verification report rendering.
- `src/runtime/omp/install.ts:29-63` — project-local OMP extension package/index/rule/agent card generation.
- `src/runtime/omp/extension.ts:6-38` — OMP command registration, status refresh hooks, prompt follow-up delivery.
- `.omp/extensions/specwright/package.json:1-8`, `.omp/extensions/specwright/index.ts:1`, `.omp/rules/specwright-workflow.md:1-8` — generated project-local OMP wiring.
- `test/core-init.test.ts:16-25`, `test/core-new.test.ts:17-27`, `test/core-prompts.test.ts:7-18`, `test/core-validators.test.ts:9-21`, `test/omp-extension.test.ts:8-40` — test coverage for the kernel and OMP adapter.

