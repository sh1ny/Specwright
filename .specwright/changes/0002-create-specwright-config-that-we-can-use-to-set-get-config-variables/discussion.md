# Discussion

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Conversation notes

- The requested change is to create Specwright configuration support that can be used to set and get config variables.
- Current implementation already has `.specwright/config.json`, a `SpecwrightConfig` type, `defaultConfig`, `loadConfig`, and `saveConfig`.
- Current CLI commands consume config internally, but there is no user-facing command for reading or updating config values.
- The phrase "config variables" needs one load-bearing decision before research/planning: whether this is a CLI command surface, an internal API, OMP slash-command behavior, or all of those.

## Open questions

- None blocking research.

Answered by user:

- Use `specwright config get <key>` / `specwright config set <key> <value>`.
- First cut supports only existing typed config paths.
- Array/object values should be passed as JSON.

## Settled decisions

- The feature should build on existing `.specwright/config.json`, `SpecwrightConfig`, `loadConfig`, and `saveConfig`.
- The CLI must remain deterministic and must not call AI/model APIs.
- Config mutation must be validated; silent broken config is not acceptable.
- Unknown config keys are rejected in this cut.
- Supported keys are `project.name`, `defaults.mode`, `defaults.pack`, `defaults.onlineResearch`, `defaults.maxContextFiles`, `defaults.maxOutputWords`, `packs.roots`, `packs.enabled`, and `runtimes.omp.enabled`.
- Array/object config values are supplied as JSON.

