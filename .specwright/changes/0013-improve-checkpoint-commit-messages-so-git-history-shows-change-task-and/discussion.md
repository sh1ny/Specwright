# Discussion

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Conversation notes

Current evidence: checkpoint commits currently build a subject from only the change slug and unit (`specwright: checkpoint <change> <unit>`) before staging/committing scoped files (`src/core/commands.ts:870-873`). Existing coverage asserts the old task and phase subjects exactly (`test/core-commands.test.ts:536-548`). The git helper currently sends one `git commit -m <message>` argument, so commit bodies require an intentional helper/API change (`src/core/git.ts:124-129`). Scoped staging/state behavior is separate and covered by command logic plus tests (`src/core/commands.ts:846-867`, `test/core-commands.test.ts:553-568`).

Asked gray areas:
- Commit subject shape: selected bracketed change/unit subject, e.g. `[0013-T001] Implement blahblah` or `[0055-T09] Fix: Fixed blah, updated docs`.
- Summary source: selected required `--summary`; callers must supply concrete wording instead of deriving it silently.
- Commit body: selected body with metadata.
- Scope: selected checkpoint plus commit alias, generated prompt updates, no old-history migration, and preserved scoped staging behavior.
## Open questions

- None after clarification.
## Settled decisions

- Future checkpoint subjects should be `[<change-id>-<unit-id>] <summary>`.
- `--summary` is required for checkpoint/commit commands and generated checkpoint prompts should include it.
- Commit bodies should record metadata while subjects stay concise.
- The change must not rewrite old commits or alter scoped staging/state sync behavior.
