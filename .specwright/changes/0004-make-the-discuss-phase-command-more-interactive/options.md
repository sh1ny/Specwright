# Options

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Option 1

### Rewrite the existing discuss prompt only

- Keep `commandDiscuss` as the single discuss entry point.
- Replace the static prompt body with an OMP-agent-led workflow contract:
  - read current discuss artifacts and bounded local evidence first;
  - identify 3-4 change-specific gray areas;
  - call Oh My Pi `ask` before writing artifacts;
  - use `multi: true` for area selection, `recommended` for defaults, descriptions for tradeoffs, grouped `questions` when related decisions should be answered together, and plain-text fallback when `ask` is unavailable/freeform;
  - write an area checkpoint after each completed gray area;
  - update `discussion.md`, `intent.md`, `constraints.md`, and `decisions.md` only after answers are settled.
- Tests: add/extend core command prompt assertions and OMP delivery assertions for `/specwright discuss`.
- Pros: smallest change, matches current architecture, no new installed files, low regression risk.
- Cons: the workflow contract is embedded in a long template string unless refactored into a helper.

## Option 2

### Add a dedicated discuss prompt module and optional discusser agent card

- Extract discuss prompt rendering into a dedicated helper/module and optionally install `.omp/agents/specwright-discusser.md`.
- The helper/card can mirror gsd-core structure more cleanly: purpose, analyze-before-ask, gray-area selection, per-area loop, checkpoint policy, final artifact writes, fallback behavior.
- Tests: prompt-helper unit tests, install tests for the new card, OMP command delivery tests, and existing discuss artifact tests.
- Pros: better maintainability if discuss keeps growing; gives OMP a named capability for future reuse.
- Cons: broader surface area (`src/runtime/omp/install.ts`, pack manifest/install tests, maybe command dispatch); more churn than needed for the currently settled scope.

## Recommendation

- Choose Option 1 now, with one small refactor if needed to keep `commandDiscuss` readable (for example, a local `renderDiscussPrompt` helper in `src/core/commands.ts` or `src/core/prompts.ts`).
- Defer a dedicated discusser agent card until there is evidence that OMP routing or future discuss modes need one.

