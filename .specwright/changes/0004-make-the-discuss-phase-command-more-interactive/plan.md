# Plan

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Decision

Implement the recommended narrow change: keep `specwright discuss` as a generated OMP-agent prompt, but replace the current static instructions with a decision-complete discuss workflow contract. Do not add a deterministic stdin wizard and do not add a new installed discusser agent in this change.

Evidence:
- Current discuss behavior is a static prompt from `commandDiscuss` (`evidence.md:7`).
- OMP already forwards command prompts into the agent conversation (`evidence.md:9`).
- Existing install has no discusser card and adding one is unnecessary for the prompt-only path (`evidence.md:11`).
- gsd-core supports the desired interaction model: analyze/scout first, select gray areas through AskUserQuestion, ask concrete optioned questions, handle fallback, checkpoint after completed areas (`evidence.md:13-17`).

## Implementation plan

1. Add a maintainable discuss prompt renderer.
   - Add `renderDiscussPrompt(...)` in `src/core/prompts.ts` beside the existing prompt helpers, and have `commandDiscuss` call it from `src/core/commands.ts`.
   - `commandDiscuss` continues to update state and ensure `discussion.md`, `intent.md`, `constraints.md`, and `decisions.md`.
   - The generated prompt must instruct the receiving OMP agent to:
     - read the four discuss artifacts first;
     - inspect bounded local evidence before asking;
     - identify 3-4 change-specific gray areas;
     - ask the user before writing artifacts;
     - use Oh My Pi `ask` with `multi: true` for area selection, `recommended` defaults, concise option descriptions, and grouped related `questions` where useful;
     - use numbered plain-text fallback and wait for the user if `ask` is unavailable or freeform input is needed;
     - write a checkpoint after each completed gray area;
     - update final discuss artifacts only after answers are settled;
     - end with `Ready for research` or the remaining load-bearing questions.

2. Add focused regression coverage.
   - Core command test: `/specwright discuss` prompt contains ask-before-write, OMP `ask` feature requirements, checkpoint guidance, and artifact paths.
   - OMP extension test: `/specwright discuss` still sends one generated prompt through `sendUserMessage` after idle and preserves existing no-options delivery behavior.
   - Existing test that discuss creates `decisions.md` remains valid.

## Risks

- Long inline prompt strings are easy to regress. Keep the workflow text in a named renderer and assert load-bearing clauses in tests.
- The prompt must not imply the CLI itself can call `ask`; the OMP agent receives the prompt and uses OMP `ask` during the conversation.
- Checkpoint guidance must not require a fully implemented validator or new schema in this change; it is workflow guidance for the agent.
- Do not weaken the frozen-after-approval block in `intent.md`; discuss updates must respect it.
