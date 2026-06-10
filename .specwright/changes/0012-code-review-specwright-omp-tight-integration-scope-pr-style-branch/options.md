# Options

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Option 1

Apply the review literally.

- Pros: mechanically tracks every review paragraph.
- Cons: wastes work on stale OMP API findings and risks regressing the already-correct `registerTool`/`tool_call` contract.
- Verdict: reject.

## Option 2

Finding-by-finding remediation with stale-finding disposition.

- Fix only findings still present in the current branch: non-mutating status classification, early in-flight guard, safe adapter regeneration, route arming/clearing, lifecycle/checkpoint tests, 0011 verify correction, and state title cleanup.
- Preserve the current OMP object-form tool registration and `toolName`/`input` blocker shape, adding regression tests if needed.
- Pros: aligns implementation with current branch evidence and avoids undoing already-correct work.
- Cons: requires explicit acceptance matrix so reviewers understand why two HIGH findings are closed as stale.
- Verdict: recommended.

## Option 3

Minimal runtime-only hotfix.

- Fix status mutation/race and adapter overwrite only.
- Pros: fastest risk reduction.
- Cons: violates clarified scope by skipping MEDIUM/LOW review items, test gaps, and 0011 artifact correction.
- Verdict: reject for this change.

## Recommendation

Use Option 2. Planning should group tasks by defect locality: status refresh, adapter regeneration, lifecycle route/tests, checkpoint forwarding test, 0011 artifact/state metadata cleanup, then focused verification.

