# Plan

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Decision

Implement only findings that remain valid on the current branch. Do not churn the already-correct OMP object-form tool registration or current tool-call event shape: `evidence.md` records `pi.registerTool({ name, label, description, parameters, execute })` and `toolCall.toolName` / `toolCall.input?.agent` are already present in `src/runtime/omp/extension.ts`.

Accepted fixes:
- Make passive OMP status refresh non-mutating and race-safe. `evidence.md` records `src/runtime/omp/status.ts` still calls `verify --json`, and its in-flight guard is set only after awaited work.
- Split stale adapter marker regeneration from global overwrite force. `evidence.md` records marker regeneration currently flows into `force` in `src/core/commands.ts`, and `src/runtime/omp/install.ts` overwrites `.omp` files with that force.
- Arm lifecycle routing only after a successful command emits a prompt. `evidence.md` records `pendingRoute` is currently assigned before command success/prompt emission.
- Strengthen OMP tests for the real object-form API, successful lifecycle routing, and checkpoint argv forwarding. `evidence.md` records current lifecycle/checkpoint coverage gaps.
- Correct unevidenced 0011 verification claims and clean the raw markdown state title. `evidence.md` records both artifact issues.

## Sources

- `intent.md`: full review scope includes HIGH, MEDIUM, and LOW findings plus 0011 artifact correction and state cleanup.
- `constraints.md`: passive status must not mutate; status should use direct readers/validators; stale adapter marker must not force-overwrite user-owned `.omp` files.
- `research.md`: finding matrix separates stale reviewed-ref API findings from current-branch defects.
- `evidence.md`: load-bearing path evidence for accepted and stale findings.
- URLs: none were present in the six allowed source files; no external citations are invented.

## Dependency order

1. Runtime safety fixes first: status refresh, adapter regeneration policy, lifecycle route arming. These touch separate modules and can be implemented independently.
2. Regression tests next: lock the already-correct OMP API shape and prove the fixed status/lifecycle/checkpoint behavior.
3. Workflow metadata cleanup last: update 0011 verification truthfulness and `.specwright/state.json` title after source behavior is fixed.
4. Final acceptance uses focused tests/inspection only; no project-wide lint, format, or test commands are required by this change.

## Implementation plan

- Replace passive status classification via `verify --json` with direct state/artifact/validator reads. Store the per-cwd in-flight promise before any await so concurrent refreshes share one path.
- Keep adapter package marker refresh separate from user-requested `--force`. Regenerate known generated adapter/marker content as needed, but preserve existing rule and agent files unless `--force` or explicit agent regeneration applies.
- Move `pendingRoute` assignment until after `runSpecwrightCommand` succeeds and returns/emits a lifecycle prompt; clear route state on failure or no-prompt results.
- Update focused tests to model OMP accurately: `registerTool(definition)`, `definition.execute(...)`, `toolName/input`, successful lifecycle prompt preconditions, and exact checkpoint argv.
- Correct 0011 verification by removing the unevidenced manual PASS/T009 completion claim rather than fabricating evidence. Clean the state title to a plain title while preserving slug/artifact identity.

## Tradeoffs

Direct status readers duplicate some classification logic from `verify`, but they avoid hidden artifact/state writes from passive UI events. Preserving existing `.omp` rule/agent files may leave stale user-customized content in place, but that is safer than silent overwrite; explicit force/regeneration remains available. Correcting 0011 verification to “not verified” is less flattering than trying to infer success from tests, but matches observed evidence.

## Risks

- Status classification can drift from verify behavior if validation logic is copied instead of shared; prefer existing core readers/validators.
- Adapter ownership boundaries must be precise; only known generated files should be rewritten without `--force`.
- Lifecycle tests must create a real change so prompt emission is proven, not assumed.

## Acceptance strategy

Run targeted tests for changed OMP/status behavior and inspect artifact edits. Acceptance is complete when passive refresh leaves `verify.md` and state unchanged, concurrent refreshes are coalesced, adapter regeneration preserves user-owned `.omp` files by default, failed lifecycle commands do not block later tools, checkpoint forwarding asserts exact argv, 0011 verification no longer claims unevidenced manual PASS, and the state title is plain text.

