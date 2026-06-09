# Evidence

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Local evidence

- Current Specwright discuss is prompt-only and writes no discussion answers: `commandDiscuss` updates state, ensures four artifacts, renders static instructions, and returns `ok("Prepared discuss prompt.", { filesCreated, prompt })` (`src/core/commands.ts:489-494`).
- Discuss artifacts are part of the built-in template file list (`src/core/commands.ts:56-62`), and `specwright discuss [<change>] [--print-prompt]` is exposed in help (`src/core/commands.ts:730-731`).
- OMP is already the right interaction channel: command results with prompts are forwarded by `pi.sendUserMessage(result.prompt)` after `waitForIdle` (`src/runtime/omp/extension.ts:12-27`).
- `sendUserMessage` can take optional delivery metadata, but existing OMP prompt tests assert no options for generated prompt delivery (`src/runtime/omp/types.ts:1-10`, `test/omp-extension.test.ts:55-68`).
- The installed OMP adapter has four agent cards and no discusser card (`src/runtime/omp/install.ts:58-116`); adding one is possible but not required for a prompt-only change.
- Current test coverage leaves room for targeted regression tests: `test/core-new.test.ts:30-41` checks discuss creates `decisions.md`, while `test/omp-extension.test.ts:55-68` checks generated prompt forwarding for `research`.
- gsd-core evidence supports the desired flow: load prior context, scout code, analyze gray areas, present remaining areas, deep-dive selected areas, then write context (`/home/bgshi/Development/Others/gsd-core/commands/gsd/discuss-phase.md:18-29`).
- gsd-core uses AskUserQuestion multi-select for gray-area selection and forbids skip/you-decide at that selection point (`/home/bgshi/Development/Others/gsd-core/gsd-core/workflows/discuss-phase.md:328-342`).
- gsd-core asks concrete per-area questions with 2-3 options, recommended choice/explanation, and code-context annotations (`/home/bgshi/Development/Others/gsd-core/gsd-core/workflows/discuss-phase/modes/default.md:47-59`).
- gsd-core handles empty/freeform answers without silent defaults: retry or numbered fallback, and freeform Other becomes a plain-text follow-up that waits for the user (`/home/bgshi/Development/Others/gsd-core/gsd-core/workflows/discuss-phase.md:95-102`, `/home/bgshi/Development/Others/gsd-core/gsd-core/workflows/discuss-phase/modes/default.md:92-96`).
- gsd-core checkpoints after each resolved area and tracks discussion log data separately from final context (`/home/bgshi/Development/Others/gsd-core/gsd-core/workflows/discuss-phase/modes/default.md:121-141`).

## Research attempts

- Used two read-only `explore` scouts: `SpecwrightDiscussScout` for local Specwright surfaces and `GsdCoreDiscussScout` for gsd-core discuss workflow. Both succeeded; no fallback retry with `task` was needed.
- No external search used under `online=auto`; local source evidence was sufficient.

## Decisions supported

- Implement an OMP agent-led prompt contract rather than a stdin CLI wizard.
- Require ask-before-write behavior in the generated discuss prompt.
- Use Oh My Pi `ask` features explicitly: multi-select gray areas, recommended option, option descriptions, grouped related questions, and plain-text fallback.
- Add area checkpoint guidance and tests around prompt content/delivery, while preserving existing artifact creation and frozen intent behavior.

