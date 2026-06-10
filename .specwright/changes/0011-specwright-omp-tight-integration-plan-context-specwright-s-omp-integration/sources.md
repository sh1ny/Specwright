# Sources

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## URLs

- `https://github.com/can1357/oh-my-pi/blob/main/docs/hooks.md` — OMP hook subsystem; `tool_call` pre-execution interception with `{ block: true, reason }` return contract.
- `https://github.com/can1357/oh-my-pi/blob/HEAD/docs/custom-tools.md` — Custom tool factory pattern; parameter schemas via Zod/TypeBox and `execute` lifecycle.
- `https://github.com/yukukotani/pi-voice/blob/main/.agents/skills/pi-coding-agent-config/references/docs/extensions.md` — Extension `registerTool` API surface with TypeBox `Type.Object` parameters and execute callback shape.

## Local references

- `src/runtime/omp/types.ts` — Current narrow `ExtensionApiLike` and `OmpContextLike`.
- `src/runtime/omp/extension.ts` — Command registration only; no tools or interception.
- `src/core/prompts.ts` — OMP-specific `task`/`ask` prose in core.
- `src/core/commands.ts` — Prompt assembly without runtime branching.
- `src/core/types.ts` — `CommandResult` shape suitable for structured tool returns.
- `src/runtime/omp/status.ts` — `tasks=` filtering; no verify/drift surfacing.
- `src/runtime/omp/install.ts` — `PACKAGE_JSON` template without adapter version marker.
- `src/core/validators.ts` — `validateChange` and `renderValidationReport` reusable for status/drift.
- `test/omp-extension.test.ts` — Mock coverage gap for widened interface.

