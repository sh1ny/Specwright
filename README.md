# Specwright

Specwright is an early-stage workflow tool for planning, executing, verifying, and handing off software changes with an AI coding agent.

It gives a change a durable home, keeps the lifecycle explicit, and records the evidence needed to understand what happened later. The goal is simple: make agent-assisted work less ad hoc by turning each change into a small set of files, prompts, tasks, checkpoints, and verification notes.

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

The tool stores change artifacts under `.specwright/`, tracks current state in a local state file, and provides commands that print prompts or perform workflow bookkeeping.

## Requirements

- Bun
- Git
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

Most lifecycle commands can also print the prompt instead of advancing work directly:

```bash
bun run specwright plan --print-prompt
```

## Checkpoints and commits

Specwright can record workflow progress for a phase or task:

```bash
bun run specwright checkpoint --task T001 --files src/example.ts,test/example.test.ts
```

To create a Git commit for selected files:

```bash
bun run specwright commit --task T001 --files src/example.ts,test/example.test.ts
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