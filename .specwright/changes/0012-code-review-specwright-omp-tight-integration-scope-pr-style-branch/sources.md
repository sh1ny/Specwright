# Sources

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## URLs

- https://cdn.jsdelivr.net/npm/@oh-my-pi/pi-coding-agent@13.17.0/examples/sdk/06-extensions.ts — OMP extension example: object-form `pi.registerTool`, command registration, `tool_call` with `toolName`, and blocker result shape.
- https://github.com/can1357/oh-my-pi/blob/main/docs/custom-tools.md — OMP custom tool docs: execution contract and structured tool result content/details.
- https://github.com/can1357/oh-my-pi/blob/main/docs/hooks.md — OMP hook docs: `tool_call` interception and `{ block: true, reason }` behavior.

## Local references

- `REVIEW-0011-OMP-INTEGRATION.md` / `intent.md:34-193` — original finding list and required scope.
- `src/runtime/omp/extension.ts:31-36,58-64,73-79,108-136` — lifecycle route state, registered tools, and `tool_call` blocker.
- `src/runtime/omp/status.ts:71-73,122,164-169` — in-flight guard, mutating `verify --json` status path, late promise registration.
- `src/runtime/omp/install.ts:150-172` and `src/core/commands.ts:441-443,1058-1060` — adapter force/regeneration wiring.
- `test/omp-extension.test.ts:484-567,641-667,689-721` — current OMP tool and lifecycle tests.
- `.specwright/state.json:449-452` — raw markdown title for change 0011.
