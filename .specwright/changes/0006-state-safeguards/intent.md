# Intent

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">
## Goal

## Users

## Non-goals

</frozen-after-approval>

## Approval notes

- Change 0006 should make `state.json` a CLI-owned derived cache for task metadata, with `tasks.md` as the model-editable source for task IDs, titles, and checkbox completion.
- Users are OMP and CLI Specwright operators who need `/specwright status`, `execute`, `verify`, `handoff`, and OMP badge refresh to reflect artifact truth without asking agents to hand-edit `state.json`.
- Non-goal for this change: adding new task creation/sync CLI UX such as `specwright task add` or `specwright task sync`.

