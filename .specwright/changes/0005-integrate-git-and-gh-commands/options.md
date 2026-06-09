# Options

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Option 1

Add curated lifecycle commands and prompt hooks.

- Extend config with `workflow.autoCommit`, `workflow.publishMode`, and `workflow.baseBranch`.
- On `specwright new`, derive `kind/id-slug`, create/switch branch, write scaffold, and commit scaffold files when auto-commit is enabled.
- Add `specwright commit <change> --files <json-or-repeatable-list> --message <text>` (alias `checkpoint`) that stages only explicit files and commits only if there is a staged diff.
- Add `specwright publish <change>` that respects `publishMode`: `none` is a no-op, `push` pushes current branch, `pr` pushes then writes a generated PR body temp file and runs `gh pr create --title --body-file --base --head`.
- Update lifecycle prompts to require the deterministic checkpoint helper after each completed phase/task with explicit touched files.

Pros: matches approved intent and GSD-core model; preserves noninteractive OMP flow; minimizes unrelated staging risk; gives tests a deterministic API. Cons: largest implementation surface.

## Option 2

Add workflow config and prompt-only git/gh instructions, without Specwright wrapping git/gh.

- `new` still creates/switches branch if auto-commit is enabled.
- Generated prompts tell agents to run raw `git add <files> && git commit` and `gh pr create` manually.
- Config only controls whether prompt text mentions commit/publish steps.

Pros: smaller initial code change. Cons: violates the deterministic helper intent, duplicates command syntax in prompts, makes OMP agents responsible for noninteractive `gh` details, and weakens exact file-list enforcement.

## Recommendation

Choose Option 1. The approved change is lifecycle automation with an explicit deterministic helper, and local evidence shows Specwright already has centralized command/config/prompt seams that can support it cleanly. Use Option 2 only as a temporary fallback if process execution cannot be made testable, but that would require renegotiating the settled intent.

