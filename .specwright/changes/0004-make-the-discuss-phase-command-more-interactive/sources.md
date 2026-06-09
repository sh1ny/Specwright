# Sources

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## URLs

- None. `online=auto`; external search was not needed because the behavior depends on local Specwright/OMP prompt contracts and local gsd-core workflow precedent.

## Local references

- `src/core/commands.ts:56-62,489-494,730-731` — template list, current `commandDiscuss`, and CLI help entry.
- `src/runtime/omp/extension.ts:12-27` — OMP command handler forwards generated prompts to the user message stream.
- `src/runtime/omp/types.ts:1-10` — `sendUserMessage` API shape and optional `deliverAs`.
- `src/runtime/omp/install.ts:58-116` — installed OMP agent cards; no discusser card currently exists.
- `src/core/prompts.ts:3-15` — reusable prompt helpers; discuss currently bypasses `renderStepPrompt`.
- `test/core-new.test.ts:30-41` — existing discuss test checks first-class decisions artifact creation.
- `test/omp-extension.test.ts:55-68,113-134` — OMP prompt delivery and install file assertions.
- `/home/bgshi/Development/Others/gsd-core/commands/gsd/discuss-phase.md:18-29,69-77` — gsd-core discuss objective and success criteria.
- `/home/bgshi/Development/Others/gsd-core/gsd-core/workflows/discuss-phase.md:95-102,312-367,369-399` — answer validation, area selection, universal checkpoint/log rules, final context write.
- `/home/bgshi/Development/Others/gsd-core/gsd-core/workflows/discuss-phase/modes/default.md:47-82,92-96,121-141` — per-area AskUserQuestion pattern, freeform handling, checkpoint timing.
- `/home/bgshi/Development/Others/gsd-core/gsd-core/workflows/discuss-phase/modes/batch.md:16-30` — grouped question batches.
- `/home/bgshi/Development/Others/gsd-core/gsd-core/workflows/discuss-phase/modes/text.md:7-15,47-55` — plain-text fallback behavior.

