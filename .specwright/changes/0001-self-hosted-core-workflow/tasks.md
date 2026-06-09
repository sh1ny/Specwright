# Tasks

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Wave 1 — Independent hardening

- [x] T001: Add first-class decisions artifact

  Files:
  - `packs/core/pack.json`
  - `packs/core/workflows/feature.json`
  - `packs/core/templates/decisions.md`
  - `src/core/commands.ts`
  - `test/core-*.test.ts`

  Action:
  - Add `decisions.md` as a built-in core artifact/template.
  - Make `discuss` create `decisions.md` from the decisions template, not the generic change template.
  - Ensure `init --force` copies the new built-in template into `.specwright/packs/core/`.

  Acceptance:
  - A fresh `new`/`discuss` flow creates `decisions.md` with `# Decisions`, `## Settled`, and `## Ready state`.
  - No unresolved `{{id}}`, `{{title}}`, `{{kind}}`, `{{mode}}`, `{{pack}}`, or `{{createdAt}}` placeholders appear in generated `decisions.md`.

  Verification:
  - Run the targeted Bun test that covers `discuss` artifact creation.
  - Run `bun run typecheck`.

- [x] T002: Harden command flag parsing

  Files:
  - `src/core/commands.ts`
  - `test/core-*.test.ts`

  Action:
  - Add tests for missing values after `--mode`, `--pack`, `--online`, and `--task`.
  - Add tests for invalid `--mode` and `--online` values.
  - Update parsing/validation only where tests expose incorrect behavior.

  Acceptance:
  - Unknown or malformed flags return `ok: false`, `exitCode: 1`, and a useful summary instead of silently continuing.
  - Valid flags keep the current behavior.

  Verification:
  - Run the targeted command parser tests.
  - Run `bun run typecheck`.

- [x] T003: Strengthen OMP adapter verification

  Files:
  - `src/runtime/omp/install.ts`
  - `src/runtime/omp/extension.ts`
  - `test/omp-extension.test.ts`

  Action:
  - Add deterministic tests for installed OMP extension file contents, including `package.json`, `index.ts`, agent cards, and rule file.
  - Keep the runtime implementation in TypeScript and avoid custom LLM-callable tools.
  - If a stable non-interactive OMP load check is available, document it in `verify.md`; otherwise keep process-level OMP loading as manual supplemental evidence.

  Acceptance:
  - Tests prove project-local `.omp/extensions/specwright` points to the TypeScript source implementation.
  - Tests prove `/specwright status` through the fake PI path updates UI notification/status and does not inject a prompt.

  Verification:
  - Run `bun test test/omp-extension.test.ts`.
  - Run `bun run typecheck`.

## Wave 2 — Self-hosting closure

- [x] T004: Verify and hand off self-hosted workflow

  Files:
  - `.specwright/changes/0001-self-hosted-core-workflow/tasks.md`
  - `.specwright/changes/0001-self-hosted-core-workflow/verify.md`
  - `.specwright/changes/0001-self-hosted-core-workflow/handoff.md`

  Action:
  - After T001–T003 pass, run the smallest checks that prove the workflow still works.
  - Record exact observed commands and outputs in `verify.md`.
  - Generate/update `handoff.md` with the next useful task or completion state.

  Acceptance:
  - `verify.md` contains observed command output for the completed tasks.
  - `handoff.md` includes goal, read-first files, current state, constraints, acceptance, and next task/completion state.

  Verification:
  - Run `bun test`.
  - Run `bun run typecheck`.
  - Run `/specwright verify` or `bun run specwright -- verify --json` and record observed output.
