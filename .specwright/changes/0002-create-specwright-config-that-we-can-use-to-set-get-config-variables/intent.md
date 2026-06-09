# Intent

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">
## Goal

Add deterministic Specwright configuration commands for reading and updating project config values stored in `.specwright/config.json`.

The first-cut command surface is:

```bash
specwright config get <key>
specwright config set <key> <value>
```

Supported keys are the existing typed `SpecwrightConfig` paths only: `project.name`, `defaults.mode`, `defaults.pack`, `defaults.onlineResearch`, `defaults.maxContextFiles`, `defaults.maxOutputWords`, `packs.roots`, `packs.enabled`, and `runtimes.omp.enabled`.

`set` must validate values and reject unknown keys. Array/object values are passed as JSON, for example:

```bash
specwright config set packs.enabled '["core"]'
```

## Users

- Specwright maintainers configuring workflow defaults.
- OMP agents that need a stable command surface for scripted project configuration changes.

## Non-goals

- Do not introduce a second config file or storage backend.
- Do not allow arbitrary unknown config keys in the root config shape.
- Do not add plugin/extension config namespaces in this cut.
- Do not preserve JSON comments; `.specwright/config.json` remains machine-readable JSON.

</frozen-after-approval>

## Approval notes

Approved by user:

- Use `specwright config get <key>` and `specwright config set <key> <value>`.
- Support existing typed config keys only in the first cut.
- Parse array/object values as JSON.
