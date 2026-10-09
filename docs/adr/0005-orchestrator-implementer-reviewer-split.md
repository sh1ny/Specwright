# 0005. Orchestrator, implementer and reviewer roles

- Status: accepted
- Date: 2026-10-09
- Supersedes: —

## Context
Implementation uses most of the tokens, while verification, committing and judgement calls are where mistakes cost most. A review written in the context that authored the design shares that context's blind spots.

## Decision
The orchestrating agent plans, verifies, ticks tasks and commits. A `specwright-implementer` agent on a cheaper model implements one task group test-first from a focused packet and reports evidence. It never commits or ticks. FULL design reviews never run in the authoring context; a LIGHT design only has the orchestrator re-check its triage and record `SKIPPED_LIGHT`. The order of preference is a different model's CLI (a Claude author uses `codex`, a Codex author uses `claude`), then a fresh-context `specwright-reviewer` agent; if neither is available, stop. `review.cross_model: false` skips the CLI.

**Rejected: one agent does everything.** It is simpler, but the expensive model does the bulk work and reviews its own design.

**Reversal cost: medium.** The agent definitions and apply instructions would change, but no stored format would.

## Consequences
- The orchestrator re-verifies delegated work: the implementer's report is evidence, not proof.
- Subagents get only what the packet and their tool list allow (for skills, see sh1ny/specwright#24).
- Cross-model review sends the change and the repo files the reviewer CLI reads to another provider.
