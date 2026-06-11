# Options

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Option 1

Add `complete` as a command-only feature with explicit `--mode` required.

- Add `WorkflowCompleteMode = "none" | "push" | "pr" | "merge"` and `ParsedArgs.completeMode`.
- Parse `--mode` against complete modes only when `parsed.command === "complete"`.
- Require `--mode` for `complete`, avoiding new config and default-mode debate.
- Implement guards and side effects in `commandComplete`.
- Leave config unchanged.

Tradeoff: smallest config footprint and safest behavior, but less convenient and diverges from existing `publish` default-mode pattern.

## Option 2

Add `complete` plus `workflow.completeMode` with a conservative default of `none`.

- Add `WorkflowCompleteMode` and `workflow.completeMode`.
- Default to `none` so omitted `--mode` never pushes, opens PRs, switches branches, or merges.
- Let users opt into `push`, `pr`, or `merge` explicitly via `--mode` or config.
- Preserve `workflow.publishMode` for remote-only publish behavior.

Tradeoff: slightly larger config/schema surface, but matches existing publish configurability while keeping the default side-effect-free.

## Option 3

Reuse `workflow.publishMode` and add `merge` to it.

- One mode field controls both publish and complete.
- Less parser/config code.

Tradeoff: rejected. It makes `publish` merge-capable by type/config implication and violates the request that publish remain remote-only.

## Recommendation

Choose Option 2 unless planning deliberately rejects a new config key. A separate `WorkflowCompleteMode` keeps publish remote-only, and defaulting `workflow.completeMode` to `none` guarantees omitted-mode completion runs guards only. This is safer than defaulting to merge during early dogfooding and still allows explicit `--mode merge`.
