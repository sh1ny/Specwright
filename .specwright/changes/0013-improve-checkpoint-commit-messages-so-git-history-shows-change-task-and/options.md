# Options

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Option A: Minimal single-message string

Construct the subject and body in `commandCheckpoint` as one multi-line string and pass it to the existing `commitStaged(cwd, message)` helper.

Changes:
1. Add `summary?: string` to `ParsedArgs`.
2. Parse `--summary <value>`.
3. Validate non-empty `--summary` in `commandCheckpoint`.
4. Construct `[<change-id>-<unit-id>] <summary>\n\n<body>` in `commandCheckpoint`.
5. Update `renderCheckpointClause` and `renderHelp` with quoted `--summary` examples.
6. Add focused checkpoint command tests.

Pros:
- Smallest implementation surface.
- No `src/core/git.ts` signature change.
- Git accepts newline-separated commit messages through `-m`.

Cons:
- `commitStaged` remains an opaque message-only API.
- Subject/body separation is not explicit at the helper boundary.
- Tests must inspect one combined string or a real commit message.

## Option B: Extend `commitStaged` with explicit body parameter

Extend `commitStaged` to accept an optional commit body and have `commandCheckpoint` pass subject and body separately.

Changes:
1. Everything in Option A, except `commandCheckpoint` builds `subject` and `body` separately.
2. Change `commitStaged` to `commitStaged(cwd: string, message: string, body?: string)`.
3. When `body` is present, pass multiple `-m` flags to git, e.g. `git commit -m <subject> -m <body>`.
4. Before changing the signature, run LSP references or scoped search for `commitStaged` and update every caller in one cutover. Do not leave an overload shim or legacy path.

Pros:
- Cleaner API: subject and body are separate concepts.
- Easier to test subject/body construction independently.
- Matches idiomatic git usage for subject plus body.
- Small blast radius if all `commitStaged` callers are updated together.

Cons:
- Touches shared git helper code.
- Requires updating every caller of `commitStaged` in the same change.

## Recommendation

Choose Option B.

Reason: the requested behavior is explicitly about useful git history, including a readable subject and structured body. Encoding that distinction in the git helper keeps the checkpoint command clearer and avoids spreading opaque multi-line commit strings. The added blast radius is limited to `commitStaged` and its callers, and should be handled with LSP references/scoped search plus a clean cutover.
