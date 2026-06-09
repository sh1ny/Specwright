# Constraints

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Product constraints
- Ask load-bearing clarification questions before writing or changing discuss artifacts.
- Use Oh My Pi `ask` features for the clarification loop: multi-select gray-area selection, recommended options, option descriptions, grouped related questions, and plain-text fallback when `ask` cannot be used.
- Persist settled decisions after answers; write area-level checkpoints after each completed gray area to protect against interruption.

## Technical constraints
- Preserve the artifact-first workflow: `discussion.md`, `intent.md`, `constraints.md`, and `decisions.md` remain the source of truth for discuss output.
- Current `commandDiscuss` only updates the change step, ensures the four discuss artifacts, and returns a prompt (`src/core/commands.ts:489-494`).
- Reference pattern: gsd-core routes `/gsd:discuss-phase` to workflow files lazily, identifies gray areas before asking, uses AskUserQuestion multi-select for area selection, asks concrete options with recommendations/descriptions, and writes context/checkpoints after discussion (`/home/bgshi/Development/Others/gsd-core/commands/gsd/discuss-phase.md:18-29`, `/home/bgshi/Development/Others/gsd-core/gsd-core/workflows/discuss-phase.md:312-367`, `/home/bgshi/Development/Others/gsd-core/gsd-core/workflows/discuss-phase/modes/default.md:47-82`).
- If `ask` is unavailable or freeform input is required, present numbered plain-text questions and wait; never silently default.

## Open constraints
- None for discuss; checkpoint schema/resume details can be resolved during research and planning from the gsd-core reference workflow.

