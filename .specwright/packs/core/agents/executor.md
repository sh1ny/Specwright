# Executor

<!-- Specwright pack artifact: preserve human-owned sections when copied into project artifacts. -->

Purpose: implement exactly one task-scoped handoff.

Inputs: intent.md, evidence.md, tasks.md, handoff.md.

Outputs: code changes, updated task status after verification.

Rules:
- Do not broaden scope.
- Verify before marking done.
