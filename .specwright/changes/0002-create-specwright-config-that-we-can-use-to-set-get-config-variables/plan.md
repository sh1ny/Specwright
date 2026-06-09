# Plan

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Decision

Implement `specwright config get <key>` and `specwright config set <key> <value>` as a core command in `src/core/commands.ts`, backed by an explicit allowlist of the approved `SpecwrightConfig` paths. This follows the evidence that all CLI and OMP execution already converges on `runSpecwrightCommand`, no `config` command exists yet, and the typed config surface is already fixed (`evidence.md:7-10`, `evidence.md:13`).

Use the existing `.specwright/config.json` path and persistence helpers only: `loadConfig` for reading/default merging and `saveConfig` for writing through the existing atomic JSON helper (`evidence.md:11-12`, `evidence.md:26`). Do not add dependencies, a second storage backend, JSON comments, plugin config namespaces, or arbitrary root keys.

Value semantics:

- `get` accepts exactly one supported key and returns the current value. Scalars are returned as stable primitive text (`true`, `lite`, `1200`); arrays are returned as compact JSON so scripted callers can parse them.
- `set` accepts exactly one supported key and one value. Unknown keys, missing args, extra args, malformed JSON for array values, and wrong types fail before saving.
- Supported string keys: `project.name`, `defaults.pack`.
- Supported enum keys: `defaults.mode` in `lite|full`; `defaults.onlineResearch` in `never|ask|auto|require`.
- Supported positive integer keys: `defaults.maxContextFiles`, `defaults.maxOutputWords`.
- Supported string-array keys, parsed from JSON: `packs.roots`, `packs.enabled`.
- Supported boolean key: `runtimes.omp.enabled`, accepting only literal `true` or `false`.
- `set` updates via cloned nested objects, validates the resulting full config shape, then calls `saveConfig` once. Failed validation leaves the existing config intact.

## Implementation plan

1. Add focused command tests first in `test/core-commands.test.ts` using existing `mkdtemp` and `runSpecwrightCommand` patterns (`evidence.md:14`).
2. Add a small config key descriptor table and parsing/formatting helpers in `src/core/commands.ts`.
3. Add `commandConfig(ctx, args)`, register `case "config"` in the dispatch switch, and add help usage.
4. Exercise OMP behavior through existing argument splitter coverage only if a regression is exposed; the shared runner means no OMP-specific command implementation is needed (`evidence.md:13`).

## Risks

- Partial writes: avoid by parsing and validating before `saveConfig`, relying on the existing atomic write helper (`evidence.md:11-12`).
- Type drift from `SpecwrightConfig`: avoid by keeping the allowlist limited to the approved typed paths and validating every key-specific value (`evidence.md:10`, `evidence.md:28-29`).
- Script output ambiguity: avoid by using primitive text for scalar `get` output and JSON for arrays.
- Command parser surprises: avoid new flags; use existing positional parsing because research found it already supports this shape (`evidence.md:8`).

