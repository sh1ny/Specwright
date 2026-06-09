# Agent Handoff: 0001

## Goal

# Intent

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">
## Goal

Make Specwright self-hosting in this repository: use its own `.specwright` artifact lifecycle and OMP `/specwright` command integration to discuss, research, plan, execute, verify, and hand off future Specwright changes.

The immediate outcome is not a new feature expansion; it is proving that the implemented core workflow is usable from OMP and that its artifacts contain enough grounded context for the next planning step.

## Users

- Specwright maintainers working in this repository.
- OMP coding agents receiving bounded prompts from `/specwright` commands.
- Future pack authors who need a small, file-based workflow kernel to dogfood before additional packs are built.

## Non-goals

- Do not add non-OMP runtime adapters in this change.
- Do not add remote pack registries, marketplace installation, or npm distribution mechanics.
- Do not add direct AI/model calls to the CLI.
- Do not broaden into game-dev pack implementation yet.

</frozen-after-approval>

## Approval notes



## Read first

- .specwright/changes/0001-self-hosted-core-workflow/intent.md
- .specwright/changes/0001-self-hosted-core-workflow/evidence.md
- .specwright/changes/0001-self-hosted-core-workflow/tasks.md
- .specwright/changes/0001-self-hosted-core-workflow/verify.md

## Current state

status=done; step=handoff

## Constraints

See intent.md and evidence.md.

## Acceptance

# Verification

## Result

PASS

## Issues

No issues.

## Observed output

- Command: `bun test`
  - Observed output: `Test Results: PASS: 9 passed`
- Command: `bun run typecheck`
  - Observed output: `tsc --noEmit` exited 0.
- Command: `bun run specwright -- verify --json`
  - Observed output:
    ```json
    {
      "ok": true,
      "issues": []
    }
    ```



## Next task

No incomplete tasks.

## Evidence

# Evidence

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local evidence

- File discovery found the implemented kernel in `src/core/*.ts`, OMP runtime in `src/runtime/omp/*.ts`, built-in pack files in `packs/core`, generated project OMP files in `.omp`, and tests in `test/*.test.ts`.
- `package.json:9-18` proves the intended gates are available: `bun test`, `tsc --noEmit`, and `bun src/cli.ts` through the `specwright` script.
- `src/core/commands.ts:208-225` shows `init` creates Specwright directories/config/state, copies the core pack, creates project files, and installs OMP.
- `src/core/commands.ts:359-365` shows `research` ensures research artifacts, sets status/step, and returns the research prompt.
- `src/core/commands.ts:381-433` shows `tasks` parses `T###` checkboxes into state and `execute` selects exactly one task and emits a task-scoped prompt.
- `src/core/commands.ts:436-448` shows `verify` runs deterministic validators first and writes `verify.md` before returning success/failure.
- `src/core/validators.ts:117-143` shows validators detect duplicate task IDs, missing tasks before execute, missing acceptance/verification blocks, and missing observed output for completed tasks.
- `src/runtime/omp/extension.ts:6-38` shows OMP registers `/specwright`, waits for idle, runs the command engine, updates UI status/notifications, and sends generated prompts as follow-up messages.
- `.omp/extensions/specwright/package.json:1-8` and `.omp/extensions/specwright/index.ts:1` show project-local OMP extension discovery points at the TypeScript source implementation.
- Tests observed in `test/*.test.ts` cover the planned minimum behavior.
- Observed commands from implementation verification: `bun test` passed 5 tests; `bun run typecheck` exited 0; dogfood `init`, `status`, `new`, `research --online require --print-prompt`, and `verify --json` behaved as expected, with `verify --json` failing on `SW001` because human-owned intent is empty.

## Research attempts

- Direct local tools used: `read` on current change artifacts; `find` over `src`, `test`, `packs/core`, and `.omp`; targeted `read` on package, command engine, validators, OMP runtime, generated OMP files, and tests.
- No scout/explore subagent retry was needed because local tool reads returned usable evidence.
- No web search was run because `online=auto` did not surface an API/dependency/standard/recent-behavior question that could not be answered locally.

## Decisions supported

- Keep CLI deterministic and prompt-producing; do not add direct AI/model calls to the CLI.
- Keep OMP as the only runtime adapter for this cut.
- Treat `.specwright/changes/<id>-<slug>/` artifacts as the handoff boundary and source-of-truth for planning/execution status.
- Use validators as the gate before verification/handoff claims.
- Fill `intent.md` before moving this change to planning; current validation failure is expected and useful.


