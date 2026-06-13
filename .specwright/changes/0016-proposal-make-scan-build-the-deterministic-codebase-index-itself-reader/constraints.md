# Constraints

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Product constraints

- Plain `specwright scan` and `/specwright scan` are the primary user experience for deterministic index creation and refresh.
- `--map` remains accepted for compatibility but has no separate artifact ownership semantics; it may influence prompt focus only if that does not reintroduce a distinct index path.
- Agents must never author, paste, or hand-edit fingerprints.
- Semantic prose remains agent-owned: `scan.md`, `tech-stack.md`, `architecture.md`, and `codebase-map.md`.

## Technical constraints

- The command owns `codebase-index.json` deterministic fields: file inventory, fingerprints, package scripts, entrypoint/module/test candidates, command names, verification commands, caps, and deterministic risks.
- Discovery should be git-assisted when a Git worktree is available, with deterministic filesystem fallback for non-Git projects.
- Git is an optimization, not a correctness dependency; non-Git temp projects must index successfully.
- Hard index validation errors rebuild deterministic data only; invalid semantic fields are not preserved.
- Missing-file warnings remain non-blocking.
- Use streaming SHA-256 for indexed-file fingerprints instead of whole-file reads.
- Default behavior skips symlinked directories and symlinked files; symlink skips are recorded as deterministic risks.
- Initial caps are maxFilesScanned = 50000, maxGitLsFilesBytes = 64 * 1024 * 1024, maxIndexedFiles = 5000, maxFingerprintBytesPerFile = 1048576, and maxRisksPerArea = 64 unless research finds a blocking implementation reason to adjust them.
- Core scan prompt wording stays runtime-neutral; OMP-specific parallel scout wording stays in the OMP prompt adapter.

## Open constraints

- None after discussion checkpoint.

