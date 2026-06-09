# Decisions

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Settled
- Scope is the discuss phase/command for change 0004; implementation tasks are not created during discuss.
- Existing behavior is prompt preparation: `commandDiscuss` updates state, ensures `discussion.md`, `intent.md`, `constraints.md`, and `decisions.md`, then renders behavioral instructions (`src/core/commands.ts:489-494`).
- Interactivity target is OMP agent-led, not a deterministic stdin CLI wizard.
- Discuss must analyze/scout first, then ask user details before writing artifacts.
- Discuss should use Oh My Pi `ask` features: multi-select gray-area selection, recommended options, option descriptions, grouped related questions, and plain-text fallback.
- Discuss should write area checkpoints after each completed gray area, then final artifacts when the user is ready for research.

## Deferred
- Exact checkpoint file/schema and resume behavior.
- Exact prompt wording and generated `ask` question shapes.

## Ready state
- Ready for research: the core interaction model is settled; research should inspect gsd-core's discuss workflow and Specwright's prompt/artifact APIs to design the concrete change.

