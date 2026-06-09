# Decisions

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Settled

- `specwright new` will accept `specwright new <kind> <request...>` as the primary contract.
- Trailing request arguments will be assembled into the source intent.
- Local `@file` references will be expanded into the assembled source intent with bounded, explicit file handling.
- The implementation will not add `--intent`, `--intent-file`, glob expansion, URL fetching, or stdin input in this change.
- Title and slug generation will be deterministic and request-derived for this change, with no runtime model dependency.
- `intent.md` will preserve the raw assembled source request; state/path metadata will store the derived title and slug.

## Deferred

- Model-refined title generation after the deterministic path exists.
- Additional input sources such as globs, URLs, stdin, or explicit intent flags.
- Changes to downstream lifecycle commands beyond help/usage text that references `specwright new`.

## Ready state

Ready for research.