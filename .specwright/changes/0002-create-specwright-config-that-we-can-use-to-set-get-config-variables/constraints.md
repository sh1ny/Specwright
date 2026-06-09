# Constraints

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Product constraints

- Users should be able to inspect and change Specwright project configuration without manually editing `.specwright/config.json`.
- The command surface must be predictable enough for OMP agents to use in scripted workflows.
- Invalid config updates must fail clearly and leave the existing config intact.

## Technical constraints

- Use existing JSON config storage at `.specwright/config.json`.
- Reuse `SpecwrightConfig`, `loadConfig`, and `saveConfig`; do not introduce a second config store.
- Keep runtime dependencies at zero.
- Writes should use the existing atomic JSON write helper.
- Preserve the CLI's deterministic behavior: no model calls.

## Open constraints

- None blocking research.

