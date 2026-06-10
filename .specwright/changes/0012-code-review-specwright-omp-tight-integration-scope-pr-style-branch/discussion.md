# Discussion

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Conversation notes

- 2026-06-10: Bounded evidence inspected before clarification. Prepared review scope is `main...refactor/0011-specwright-omp-tight-integration-p` with 26 files and +2513/-83 recorded in `intent.md`; local refs resolve to `main` `9195a55f8f7c35a7559e771d271334197156fa72`, reviewed ref `d50048fc8176e84152084cadba361fd3c2a48d33`, and current branch `bugfix/0012-code-review-specwright-omp-tight-int` at `2d9fe5d342a56cce9ad1a96af87c012fab5faa10`.
- Source evidence: `src/runtime/omp/extension.ts` currently shows object-form `registerTool(...)`, `toolName/input` tool-call handling, and `pendingRoute` set before command execution; `src/runtime/omp/status.ts` still calls `verify --json` during status loading; `src/core/commands.ts` still passes `args.force || needsRegen` / `force: needsRegen` into OMP adapter installation; `test/omp-extension.test.ts` now contains object-form tool mocks plus status refresh and regeneration tests; 0011 `tasks.md` requires manual OMP checks for T009.
## Open questions

- None after 2026-06-10 clarification. Research should produce an evidence matrix rather than reopen scope.
## Settled decisions

- Scope: user selected **All findings**. 0012 research/plan must carry every HIGH/MEDIUM/LOW item from the review as acceptance criteria, including the 0011 verification artifact/status cleanup.
- Baseline: user selected **Both with matrix**. Research must map each review finding against the frozen reviewed ref and the current bugfix branch, marking already-fixed, still-present, and uncertain items with path evidence.
- Passive status design: user selected **Direct non-mutating validation**. OMP passive UI refresh must not call mutating `verify --json`; it should classify status from core readers/validators without writing `verify.md` or derived state.
- Adapter overwrite policy: user selected **Preserve user files**. A stale adapter marker may refresh known generated package/extension internals, but existing rules/agents stay untouched unless `--force` or explicit agent regeneration applies.
