# Discussion

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Conversation notes
- User started Specwright discuss for change `0004-make-the-discuss-phase-command-more-interactive`.
- Required limits: max 6 context files, max 1200 output words, do not load full packs or unrelated docs.
- Initial discuss artifacts were empty; current `commandDiscuss` only prepares artifacts and emits a prompt (`src/core/commands.ts:489-494`).
- User clarified the correction: the agent must ask about details before writing anything down.
- User directed research to gsd-core's discuss implementation at `/home/bgshi/Development/Others/gsd-core`.
- gsd-core pattern observed: `/gsd:discuss-phase` analyzes prior context/code, presents gray areas via AskUserQuestion multi-select, asks concrete recommended/described options, handles fallbacks, and writes checkpoints/context after discussion.
- User selected OMP agent-led interaction, area checkpoints, and all proposed Oh My Pi `ask` features.

## Open questions
- None for discuss. Checkpoint schema/resume behavior and concrete prompt wording can be resolved during research/planning from the gsd-core reference workflow.

## Settled decisions
- Discuss must not create implementation tasks.
- The frozen-after-approval block in `intent.md` remains intact.
- Settled decisions, intent, and constraints are captured in the discuss artifacts before research.
- The interaction model is OMP agent-led, not a deterministic stdin CLI wizard.
- Discuss must ask before writing artifacts.
- Discuss should write area-level checkpoints after each completed gray area.
- Required Oh My Pi `ask` features: multi-select areas, recommended options, option descriptions, grouped questions, and plain-text fallback.

