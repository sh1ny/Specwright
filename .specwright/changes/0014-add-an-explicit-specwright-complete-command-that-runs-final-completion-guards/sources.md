# Sources

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## URLs

No external URLs were consulted. Local source and `localdocs/MERGE-PROPOSAL.md` fully answer this research question.

## Local references

- `localdocs/MERGE-PROPOSAL.md:21-33` — proposes explicit `specwright complete` and keeps merge out of verify/handoff/checkpoint/publish.
- `localdocs/MERGE-PROPOSAL.md:52-86` — defines `none`, `push`, `pr`, and no-fast-forward `merge` behavior.
- `localdocs/MERGE-PROPOSAL.md:88-105` — lists completion guardrails and merge-conflict handling.
- `localdocs/MERGE-PROPOSAL.md:139-142` — recommends no branch deletion by default.
- `src/core/commands.ts:126-138` — command-sensitive `--mode` parsing currently distinguishes publish from lifecycle/new modes.
- `src/core/commands.ts:956-1022` — verify and handoff responsibilities are separate from integration.
- `src/core/commands.ts:1093-1121` — publish is remote-only push/PR behavior.
- `src/core/git.ts:79-188` — existing git worktree, branch, push, PR, and base-resolution helpers.
- `src/core/validators.ts:150-220` — existing validation and observed-output checks.
- `test/core-commands.test.ts:1244-1350` — existing publish mode tests and real git/gh test patterns.
