# Agent Handoff: 0008

## Goal

# Intent

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">
## Goal

Add smart subagent routing for Specwright lifecycle work in OMP. Research, planning, execution, and verification should each route to the matching Specwright subagent, with planning using `pi/plan` by default and general task work using `pi/task` by default.

## Users

- Specwright users running `/specwright` inside OMP.
- Maintainers configuring model routing for different workflow phases.
- Future pack authors who need predictable agent/model defaults without changing core execution flow.

## Non-goals

- Do not add Specwright-owned memory or session-memory features; rely on OMP native memory/hindsight.
- Do not implement direct extension-managed subagent dispatch unless OMP exposes a stable API for it.
- Do not require manual user switching between agents.
- Do not broaden this into a new runtime abstraction layer.

</frozen-after-approval>

## Approval notes

Starting point derived from the approved smart-subagent-routing implementation plan. Discuss clarification keeps executor spawn-capable with main-agent fallback, limits routing to research/plan/execute/verify, and changes the config surface from flat `modelRoles.*` keys to per-agent `agents.*.model` objects.


## Read first

- .specwright/changes/0008-smart-subagent-routing/intent.md
- .specwright/changes/0008-smart-subagent-routing/evidence.md
- .specwright/changes/0008-smart-subagent-routing/tasks.md
- .specwright/changes/0008-smart-subagent-routing/verify.md

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



### 2026-06-09 focused quality gates

Source: `.specwright/changes/0008-smart-subagent-routing/tasks.md` T008.

Command:

```sh
bun test test/core-validators.test.ts test/core-commands.test.ts test/core-prompts.test.ts test/omp-extension.test.ts && bun run typecheck
```

Observed output:

```text
Test Results:
   PASS: 55 passed
```

Follow-up typecheck confirmation after fixing strict TypeScript errors surfaced during verification:

```sh
bun run typecheck
```

Observed output:

```text
$ tsc --noEmit


Wall time: 0.84 seconds
```

## Next task

No incomplete tasks.

## Evidence

# Evidence

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local evidence

- Contract correction: the approved surface is `agents.<researcher|planner|executor|verifier>.model`, not `modelRoles.*` (`intent.md:25-28`, `constraints.md:7-17`).
- Absence check: search for `modelRoles|agents.(researcher|planner|executor|verifier)|model:|spawns:` in `src/` and `test/` returned no matches.
- Config type/default gap: `SpecwrightConfig` lacks `agents` (`src/core/types.ts:22-49`), `defaultConfig()` lacks agent defaults (`src/core/state.ts:12-35`), and `loadConfig()` does not merge `agents` (`src/core/state.ts:248-282`).
- Config command gap: `CONFIG_KEY_DESCRIPTORS` has no `agents.*.model` descriptors (`src/core/commands.ts:230-316`), while `commandConfig()` can persist any new descriptor after validation (`src/core/commands.ts:880-918`).
- Validation gap: `validateSpecwrightConfig()` validates existing config sections only (`src/core/validators.ts:55-76`).
- OMP install gap: `commandInit()` calls `installOmpAdapter({ cwd, force })` (`src/core/commands.ts:387-404`), and `installOmpAdapter()` writes static agent Markdown without `model` or `spawns` frontmatter (`src/runtime/omp/install.ts:58-138`).
- Extension dispatch gap: `sendUserMessage()` exposes only delivery style options (`src/runtime/omp/types.ts:1-10`), and the OMP extension sends prompts as plain user messages (`src/runtime/omp/extension.ts:19-27`).
- Prompt gap: research has a scout retry clause (`src/core/prompts.ts:3-5`), but plan/execute/verify prompt assembly lacks lifecycle routing instructions (`src/core/commands.ts:626-664`, `src/core/commands.ts:779-793`, `src/core/commands.ts:796-838`).
- OMP compatibility: OMP discovers `.omp/agents/*.md` project agents (`/home/bgshi/Development/Others/oh-my-pi/packages/coding-agent/src/task/discovery.ts:1-13`, `:59-122`), parses `model` and `spawns` (`/home/bgshi/Development/Others/oh-my-pi/packages/coding-agent/src/discovery/helpers.ts:223-273`), and resolves task subagent models from settings override then agent frontmatter (`/home/bgshi/Development/Others/oh-my-pi/packages/coding-agent/src/task/index.ts:690-700`).
- Test impact: update prompt tests (`test/core-prompts.test.ts:7-84`), config tests (`test/core-commands.test.ts:87-184`), and OMP agent install tests (`test/omp-extension.test.ts:215-246`).

## Research attempts

- Local repository inspection: completed with `find`, `search`, `read`, and read-only explore scouts.
- Explore scout `ConfigSurfaceScout`: succeeded; reported no `agents.*` or `modelRoles` and identified config/test impact.
- Explore scout `OmpPromptScout`: succeeded; reported no generated `model`/`spawns` and identified prompt/install gaps.
- Scout fallback retry: not needed because both explore scouts returned usable reports.
- Local OMP source inspection: completed; found project agent discovery, frontmatter model/spawn support, and task model resolution order.
- Web research: skipped under `online=auto` because local source answered all API/dependency questions.

## Decisions supported

- Add `agents` config objects and defaults, not `modelRoles`.
- Generate `.omp/agents/specwright-*.md` from config with explicit `model` and `spawns: []`.
- Regenerate generated agents when `agents.*.model` changes if OMP runtime is enabled.
- Add prompt-level spawn strategy for research, plan, execute, and verify because direct extension-managed dispatch is unavailable.
- Keep memory/session-memory and recursive spawning out of scope.
