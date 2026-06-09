# Constraints

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Product constraints

- Must not break existing change directory structure or artifact file naming.
- Must preserve backward compatibility for `specwright status --json` output shape.
- The frozen-after-approval block in `intent.md` must remain untouched.

## Technical constraints

- Node.js `fs/promises` read/write ordering is async; state.json must be written before it is staged in checkpoint.
- OMP `refreshStatus` runs inside the same Node.js process; no true parallelism, but reads must see the latest written state.
- `syncChangeTasksForCommand()` must remain idempotent — calling it multiple times on the same `tasks.md` content must produce the same result.

## Open constraints

None.
