# Decisions

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Settled

- Checkpoint commit subjects will use the bracketed subject form `[<change-id>-<unit-id>] <summary>` with no `specwright: checkpoint` prefix. Examples: `[0013-T001] Implement checkpoint summary support`, `[0013-discuss] Settle checkpoint message policy`.
- `--summary` will be required for `checkpoint` and `commit` invocations. The implementation should reject missing or blank summaries instead of deriving subjects silently.
- Checkpoint commits will include a body with metadata for review/audit context: change slug, unit kind/id, summary, task title when available, phase when applicable, and scoped files.
- `checkpoint` and `commit` aliases remain behaviorally identical.
- Generated checkpoint prompt text must include the new summary argument once implemented.
- Scoped file staging and `.specwright/state.json` synchronization behavior stay unchanged.
## Deferred

- No migration or rewriting of historical checkpoint commits.
## Ready state

- Ready for research. The load-bearing policy choices are settled; research should verify exact parser/help/test impacts and the safest commit helper shape for subject plus body.
