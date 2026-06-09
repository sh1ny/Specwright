# Constraints

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Product constraints

- The user should not have to manually switch agents.
- A future model reading `specwright research`, `specwright plan`, `specwright execute`, or `specwright verify` must understand that inline lifecycle work is not authorized while the `task` tool, target Specwright subagent, and configured model are available.
- Routing failures should be visible. The agent must report the missing `task` tool, target Specwright subagent, or configured model instead of silently absorbing the worker role.
- The language must be Specwright-native and concise, not copied from GSD-core prompts.

## Technical constraints

- OMP extension delivery still uses plain user messages; there is no direct extension-managed dispatch API in the current Specwright runtime boundary.
- `renderLifecycleSpawnStrategy()` is the shared prompt helper for research, plan, execute, and verify and is the likely central edit point.
- Prompt assembly lives in `src/core/commands.ts`; only research, plan, execute, and verify should receive routed lifecycle language.
- Generated agent files live in `src/runtime/omp/install.ts`; keep `model: <configured value>` and `spawns: []`.
- Tests should cover prompt text in `test/core-prompts.test.ts`; update config or OMP install tests only if those surfaces change. This change should not add a fallback-policy config knob.

## Open constraints

- None for discuss.