# Intent

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">
## Goal

Make Specwright self-hosting in this repository: use its own `.specwright` artifact lifecycle and OMP `/specwright` command integration to discuss, research, plan, execute, verify, and hand off future Specwright changes.

The immediate outcome is not a new feature expansion; it is proving that the implemented core workflow is usable from OMP and that its artifacts contain enough grounded context for the next planning step.

## Users

- Specwright maintainers working in this repository.
- OMP coding agents receiving bounded prompts from `/specwright` commands.
- Future pack authors who need a small, file-based workflow kernel to dogfood before additional packs are built.

## Non-goals

- Do not add non-OMP runtime adapters in this change.
- Do not add remote pack registries, marketplace installation, or npm distribution mechanics.
- Do not add direct AI/model calls to the CLI.
- Do not broaden into game-dev pack implementation yet.

</frozen-after-approval>

## Approval notes

