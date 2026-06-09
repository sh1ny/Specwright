# Intent

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">
## Goal

Add Specwright lifecycle git/GitHub automation modeled on GSD-core: create a feature branch when a change is created, provide an explicit deterministic commit/checkpoint helper that generated prompts require agents to run after completing phases/tasks, commit exactly the files touched for that completed unit, and optionally publish completed workflows by pushing or creating a GitHub PR.

## Users

- Developers using Specwright through CLI or OMP who want durable per-phase/task history without manually typing repetitive git commands.
- Receiving OMP agents executing Specwright prompts that need a deterministic, noninteractive way to commit completed work.

## Non-goals

- Do not implement arbitrary `git`/`gh` pass-through as the primary feature.
- Do not run interactive `gh auth login` or terminal prompts.
- Do not create implementation tasks during discussion.

</frozen-after-approval>

## Approval notes

