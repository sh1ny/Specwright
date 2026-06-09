# Options

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Option 1

Add a small allowlisted key descriptor table in `src/core/commands.ts`.

- Shape: `{ path, read(config), write(config, parsedValue), parse(raw) }` for each approved key.
- `get` resolves the descriptor and formats the current value.
- `set` parses by descriptor type, clones the relevant nested objects, writes the updated config with `saveConfig`, and returns a concise success summary.
- Pros: minimal files touched, easy to review, no new abstractions, strongly matches the first-cut key list.
- Cons: table lives in the already-large command file.

## Option 2

Create a dedicated config command module, for example `src/core/config-command.ts`, exporting `commandConfig`.

- Move descriptor table, value parsing, formatting, and immutable update helpers into the new module.
- `src/core/commands.ts` only imports and dispatches `commandConfig`.
- Pros: keeps config parsing/test surface isolated and avoids growing `commands.ts`.
- Cons: one more module for a small first-cut command, and existing commands are currently colocated in `commands.ts`.

## Recommendation

Choose Option 1 for this cut. The supported key surface is small and mechanically constrained by `SpecwrightConfig`; colocating the descriptor table with other command handlers is the boring path and avoids premature module boundaries. If config subcommands grow beyond `get/set` or support plugin namespaces later, extract the table and parser into a dedicated module then.

