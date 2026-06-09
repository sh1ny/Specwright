# Plan

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Decision

Continue with the current clean-cut implementation and harden only the gaps discovered by dogfooding. Do not redesign the kernel or add runtimes. The next work should make the self-hosted workflow reliable enough for normal OMP `/specwright ...` use.

Evidence:
- `evidence.md` shows the implemented kernel and OMP runtime exist in `src/core/*.ts` and `src/runtime/omp/*.ts`.
- `evidence.md` confirms tests and typecheck passed after bootstrap.
- `evidence.md` shows `/specwright` behavior is covered by a fake-PI unit test, but full OMP process loading is not yet a reliable automated gate.
- `evidence.md` shows `verify` is validator-first and correctly blocked while `intent.md` was empty; discuss has now filled the human-owned intent.
- `evidence.md` plus current discussion revealed one concrete artifact issue: `discuss` created `decisions.md` from the generic `change.md` template because there is no dedicated decisions template.

## Implementation plan

### Wave 1 — Independent hardening

These tasks can be implemented independently because they touch different failure surfaces.

1. Add a first-class `decisions.md` artifact/template so future `discuss` runs do not create placeholder-filled decision files.
2. Harden command argument edge cases around missing/invalid flag values and add tests that lock the intended CLI behavior.
3. Strengthen OMP adapter verification around installed project-local extension files and command registration without adding a second runtime or custom tools.

### Wave 2 — Self-hosting closure

After Wave 1, run the Specwright flow against this change and update verification/handoff artifacts with observed results. This proves the repository can use its own artifacts as the next-agent handoff boundary.

## Risks

- OMP process-level extension loading may be environment-sensitive; keep unit tests deterministic and treat an interactive OMP smoke check as supplemental unless a stable CLI check is identified.
- Over-hardening before real use could recreate framework sprawl. Keep tasks narrow and backed by `evidence.md`.
- The frozen intent block is human-owned. Do not edit it during execution unless the user renegotiates scope.

