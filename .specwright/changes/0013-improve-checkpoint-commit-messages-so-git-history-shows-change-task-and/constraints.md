# Constraints

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Product constraints

- Future `git log --oneline` output must make the Specwright change and task/phase visible without opening the commit.
- Checkpoint callers must provide a concrete summary with `--summary`; vague generated subjects are not acceptable.
- Existing repository history is not rewritten.
## Technical constraints

- `checkpoint` and `commit` aliases must share identical message behavior because both route through the checkpoint command.
- Commit subjects use `[<change-id>-<unit-id>] <summary>`; unit id is the task id for task checkpoints and the phase name for phase checkpoints.
- Commit bodies should include structured metadata: change slug, unit kind/id, supplied summary, task title when available, phase when applicable, and scoped files.
- Preserve scoped staging and current `.specwright/state.json` inclusion/sync behavior.
- Generated lifecycle prompts and help/usage must be updated if `--summary` becomes required.
## Open constraints

- None after discuss clarification.
