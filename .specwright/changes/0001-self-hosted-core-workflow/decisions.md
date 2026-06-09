# Decisions

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Settled

- Specwright will dogfood itself before expanding into additional packs or runtimes.
- OMP is the only implemented runtime adapter for now.
- `/specwright` in OMP is the normal interactive entrypoint; `bun run specwright -- ...` remains the deterministic CLI path.
- The CLI must not call AI models directly.
- Research can proceed from local evidence for this change; `online=auto` does not require web search unless a dependency/API/standard/recent-behavior question appears.

## Ready state

Ready for research.