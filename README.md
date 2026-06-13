# Specwright

Specwright is an early-stage workflow tool for planning, executing, verifying, and handing off software changes with an AI coding agent.

Right now, Specwright is tied to OMP (Oh My Pi). The core CLI exists, but the current workflow, prompts, agent routing, and integration assumptions are built specifically around OMP.

It gives a change a durable home, keeps the lifecycle explicit, and records the evidence needed to understand what happened later. The goal is simple: make OMP-assisted work less ad hoc by turning each change into a small set of files, prompts, tasks, checkpoints, and verification notes.

Specwright is still young. Expect rough edges, changing command shapes, and incomplete integrations. Use it on a disposable branch until you trust the workflow in your project.

## What it does

Specwright helps you run a change through a repeatable lifecycle:

1. **Discuss** — clarify intent, constraints, and open questions.
2. **Research** — gather local or online evidence before planning.
3. **Plan** — decide the implementation shape.
4. **Tasks** — break the plan into concrete work items.
5. **Execute** — work one task at a time.
6. **Verify** — check the change against its acceptance criteria.
7. **Handoff** — leave enough context for the next maintainer or agent.

The tool stores change artifacts and project scan notes under `.specwright/`, tracks current workflow state in a local state file, and provides commands that print prompts or perform workflow bookkeeping.

## Requirements

- Bun
- Git for branch, checkpoint, publish, and complete workflows
- Node-compatible shell environment

Install dependencies after cloning:

```bash
bun install
```

## Basic usage

Initialize Specwright in a repository:

```bash
bun run specwright init
```

Create or refresh project scan notes and the deterministic codebase index:

```bash
bun run specwright scan
bun run specwright scan --json
```

Check current workflow state:

```bash
bun run specwright status
```

Start a new change:

```bash
bun run specwright new feature "Add project onboarding flow"
```

Move through the lifecycle:

```bash
bun run specwright discuss
bun run specwright research
bun run specwright plan
bun run specwright tasks
bun run specwright execute --task T001
bun run specwright verify
bun run specwright handoff
```

## Project scanning

`specwright scan` keeps mechanical codebase facts command-owned and leaves interpretation to agents or maintainers.

On every run, Specwright rebuilds the deterministic codebase index and writes it only when it is missing, stale, or forced. The index contains file inventory, fingerprints, package scripts, entrypoints, modules, tests, verification commands, and scan coverage risks. Agents should treat that data as read-only evidence.

The editable scan documents remain prose-owned. Use them for architecture notes, conventions, semantic summaries, and open questions. Do not hand-edit checksums or fingerprint JSON.

Useful scan modes:

```bash
bun run specwright scan
bun run specwright scan --json
bun run specwright scan --map
bun run specwright scan --refresh
```

Scan modes:
- plain `scan` — refresh deterministic index data and prompt for project prose review.
- `--json` — return observable scan state such as `indexUpdated`, `staleFiles`, `scannedFiles`, `indexedFiles`, and `truncated`.
- `--map` — focus the prose prompt on the codebase map while keeping deterministic index ownership unchanged.
- `--refresh` — compatibility spelling for the same deterministic refresh path, with refresh-oriented prompt wording.

Scan works without Git. In Git repositories, Specwright can use tracked and untracked file discovery while respecting ignore rules.

## Publishing and completing a change

### Publish

`specwright publish` pushes the current feature branch to the remote. It does **not** merge.

```bash
bun run specwright publish
bun run specwright publish --mode none
bun run specwright publish --mode push
bun run specwright publish --mode pr
```

Publish modes:
- `none` — no remote work (default when configured as `none`).
- `push` — push the current feature branch to the configured remote.
- `pr` — push and open a pull request targeting the configured base branch.

Publish is remote-only. It never switches branches, pulls, or merges.

### Complete

`specwright complete` runs final completion guards and then performs the selected mode action.

```bash
bun run specwright complete
bun run specwright complete 0001
bun run specwright complete --mode none
bun run specwright complete --mode push
bun run specwright complete --mode pr
bun run specwright complete --mode merge
```

Complete modes:
- `none` — run guards only, set change status to done (default).
- `push` — run guards, then push the current feature branch to the remote.
- `pr` — run guards, push, then open a pull request.
- `merge` — run guards, switch to the base branch, and merge the feature branch with `--no-ff`.

Complete runs all guards **before** any side effect. It fails before push, PR creation, or merge when:
- Not in a git worktree or on a detached HEAD.
- On the base branch.
- Worktree is dirty.
- Validation fails.
- Tasks are missing or incomplete.
- `verify.md` is missing or lacks observed command/output evidence.
- `handoff.md` is missing or empty.
- Branch name does not match the change.

Merge conflicts are discovered during the merge itself, after switching to the base branch and starting the merge. They are not a pre-side-effect guard. If a merge fails, you may need to run `git merge --abort` and clean up manually.

Complete does **not** delete branches by default and does **not** pull/update the base branch automatically.

Most lifecycle commands can also print the prompt instead of advancing work directly:

```bash
bun run specwright plan --print-prompt
```

## Checkpoints and commits

Specwright can record workflow progress for a phase or task:

```bash
bun run specwright checkpoint --task T001 --summary "Add example feature" --files src/example.ts,test/example.test.ts
```

To create a Git commit for selected files:

```bash
bun run specwright commit --task T001 --summary "Add example feature" --files src/example.ts,test/example.test.ts
```

Use explicit file lists. This keeps checkpoints narrow and makes review easier.

## Verification

Run the project checks:

```bash
bun run check
```

Run Specwright artifact validation:

```bash
bun run specwright verify
```

For a specific change:

```bash
bun run specwright verify 0012
```

Verification is part of the workflow. A change is not complete just because the code compiles; it should also have recorded evidence that the requested behavior was checked.

## Packs and configuration

Specwright ships with a core pack. Packs define reusable workflow assets such as templates, validators, and agent instructions.

List packs:

```bash
bun run specwright pack list
```

Validate packs:

```bash
bun run specwright pack validate
```

Read or update configuration:

```bash
bun run specwright config get <key>
bun run specwright config set <key> <value>
```

## Development

Run tests:

```bash
bun test
```

Run TypeScript validation:

```bash
bun run typecheck
```

Run both:

```bash
bun run check
```

## Project status

Specwright is an early version. The core workflow is usable, but the project is still evolving. Commands, artifacts, and integrations may change as the tool is exercised on real work.

If you use it now, keep changes small, commit often, and review generated artifacts before relying on them.