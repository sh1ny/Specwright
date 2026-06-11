# Intent

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">
## Goal

Improve future checkpoint/commit git history so each checkpoint commit subject shows the Specwright change id, task or phase unit, and a concrete human summary. The selected subject format is `[<change-id>-<unit-id>] <summary>`, e.g. `[0013-T001] Implement checkpoint summary support`.
## Users

- Maintainers scanning `git log --oneline` to understand which Specwright change and task produced a commit.
- Agents and humans using checkpoint history as an audit trail during review, handoff, or rollback.
## Non-goals

- Do not rewrite or migrate existing checkpoint commits.
- Do not change which files checkpoint/commit stages, including current `.specwright/state.json` synchronization behavior.
- Do not create implementation tasks during discuss.
</frozen-after-approval>

## Approval notes
### Source request
improve checkpoint commit messages so git history shows change task and concrete summary
### Expanded request
improve checkpoint commit messages so git history shows change task and concrete summary