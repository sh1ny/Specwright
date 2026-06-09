# Research

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local findings

- `commandDiscuss` is currently a thin prompt generator: it updates the change to `status=discussing`, ensures `discussion.md`, `intent.md`, `constraints.md`, and `decisions.md`, then returns one static prompt string (`src/core/commands.ts:489-494`). There is no separate discuss prompt helper, checkpoint schema, discuss validator, or discuss-specific OMP agent today.
- OMP delivery is already agent-led: the extension waits for idle, runs the shared command, then forwards `CommandResult.prompt` via `pi.sendUserMessage(result.prompt)` (`src/runtime/omp/extension.ts:12-27`). The API type supports `sendUserMessage(content, options?: { deliverAs?: "steer" | "followUp" })`, but current tests expect generated prompts to send with no options (`src/runtime/omp/types.ts:1-10`, `test/omp-extension.test.ts:55-68`).
- OMP install currently ships researcher/planner/executor/verifier agent cards only (`src/runtime/omp/install.ts:58-116`). Adding a dedicated discusser card would touch install surfaces and tests, but the current command can also be improved without adding another installed agent.
- Current tests only assert discuss creates `decisions.md`; discuss prompt behavior is otherwise untested (`test/core-new.test.ts:30-41`). OMP prompt tests exercise the same send path using `research`, not `discuss` (`test/omp-extension.test.ts:55-68`).
- gsd-core's `/gsd:discuss-phase` is the closest reference: it loads prior context, scouts code, analyzes gray areas, lets the user choose areas, deep-dives each selected area, and writes context only after discussion (`/home/bgshi/Development/Others/gsd-core/commands/gsd/discuss-phase.md:18-29`).
- gsd-core's discuss workflow explicitly asks before writing: gray areas are presented through `AskUserQuestion` multi-select (`/home/bgshi/Development/Others/gsd-core/gsd-core/workflows/discuss-phase.md:312-342`), per-area questions use concrete options with recommendations and code context (`/home/bgshi/Development/Others/gsd-core/gsd-core/workflows/discuss-phase/modes/default.md:47-82`), and checkpoints are written only after an area is resolved (`/home/bgshi/Development/Others/gsd-core/gsd-core/workflows/discuss-phase/modes/default.md:121-141`).
- gsd-core has useful fallback patterns: empty `AskUserQuestion` answers retry or degrade to numbered plain text (`/home/bgshi/Development/Others/gsd-core/gsd-core/workflows/discuss-phase.md:95-102`), `--text` disables menu UI and uses numbered replies (`/home/bgshi/Development/Others/gsd-core/gsd-core/workflows/discuss-phase/modes/text.md:7-15`), and `--batch` groups 2-5 related questions into one plain-text turn (`/home/bgshi/Development/Others/gsd-core/gsd-core/workflows/discuss-phase/modes/batch.md:16-30`).

## External findings

- No web search used. This change is constrained by local Specwright command generation, local OMP adapter behavior, and the local gsd-core reference workflow. No public dependency/API behavior was needed.

## Implications

- The minimal high-confidence path is to rewrite the generated discuss prompt so the receiving OMP agent must scout/analyze first, invoke Oh My Pi `ask` before any artifact writes, checkpoint after completed gray areas, and then update final artifacts.
- The prompt should spell out exact `ask` usage: multi-select area selection, recommended option index, option descriptions, grouped related questions when useful, and a plain-text fallback that waits for the user instead of defaulting.
- Verification should add focused tests for the generated discuss prompt and OMP `/specwright discuss` delivery path; existing `new and discuss create decisions.md` must continue to pass.

