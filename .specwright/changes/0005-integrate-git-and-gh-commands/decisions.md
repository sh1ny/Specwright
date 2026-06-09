# Decisions

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Settled

- The change is lifecycle automation, not a broad manual `git`/`gh` pass-through surface.
- Mirror GSD-core's explicit commit-helper model: workflows/prompts call a deterministic commit/checkpoint helper with explicit files after work is complete.
- `specwright new` should create or switch to the feature branch and commit the new change scaffold directly when auto-commit is enabled.
- Agents must pass explicit touched-file lists; Specwright should commit code and artifact changes for that completed phase/task, but not unrelated files.
- `gh` integration is noninteractive and fail-fast.
- Branch scheme: `kind/id-slug`.
- Config namespace: `workflow`.
- Defaults: auto-commit on; publish off.
- Publishing is configurable; PR publishing should push and create a rich GitHub PR from Specwright artifacts.

## Deferred

- Arbitrary `specwright git -- ...` / `specwright gh -- ...` pass-through.
- Interactive gh login setup.
- Exact PR body template details pending research.

## Blocking facts

- 2026-06-09: Resolved. `.specwright/state.json` had `T005`/`T006` titles swapped; it now matches `tasks.md` with `T005: Generate rich PR bodies` and `T006: Implement publish modes`.

## Ready state

Ready for research.

