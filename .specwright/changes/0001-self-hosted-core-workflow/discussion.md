# Discussion

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Conversation notes

- Specwright core has been implemented and dogfooded in this repository.
- The user wants to use Specwright through OMP slash commands without `bun run`.
- The current change exists to make the repository self-hosting: Specwright should manage its own future planning, research, execution, verification, and handoff artifacts.
- Research has already collected local evidence for the current implementation and identified the main remaining gap: approved intent/constraints were empty.

## Open questions

- None blocking research. Future planning can decide which hardening tasks are first.

## Settled decisions

- Use OMP `/specwright ...` commands as the preferred interactive path.
- Keep the CLI deterministic: it creates files, updates state, validates artifacts, and prints prompts; it does not call AI models directly.
- Keep OMP as the only implemented runtime adapter for the first cut.
- Continue dogfooding before adding other runtime adapters, remote pack registries, or standalone web research clients.
- Treat `.specwright/changes/<id>-<slug>/` as the source-of-truth for change state.

