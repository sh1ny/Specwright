# Architecture

## Overview

Specwright is a file-based workflow kernel for AI-assisted software changes. It manages project/change artifacts, deterministic state, local packs, validators, handoff generation, and OMP integration. It deliberately avoids direct model calls in the CLI.

## Core directories

- `src/core/`
  - Runtime-neutral domain model, path helpers, JSON IO, slug/id helpers, state management, prompt fragments, validators, and command engine.
- `src/runtime/omp/`
  - OMP adapter installation and extension registration.
- `packs/core/`
  - Built-in core software pack with artifact templates, workflow manifest, agent cards, and validator manifest.
- `test/`
  - Bun tests for the kernel and OMP adapter.
- `.specwright/`
  - Project-local generated config, state, project scan docs, change artifacts, cache/tmp, and copied packs.
- `.omp/`
  - Project-local OMP extension, agent cards, and workflow rule.

## Data model

- `SpecwrightConfig` describes project defaults, pack roots/enabled packs, and runtime enablement.
- `SpecwrightState` tracks the current change and all known changes.
- `ChangeState` tracks id, slug, title, kind, pack, mode, lifecycle step, status, timestamps, and parsed task state.
- `TaskState` tracks task id, title, status, and update time.

## Lifecycle

The fixed lifecycle is:

```txt
discuss -> research -> plan -> execute -> verify -> handoff
```

Commands update state/artifacts and return prompts:

- `init` creates `.specwright`, copies the built-in core pack, creates project stubs, and installs the OMP adapter.
- `scan` prepares project-level scan docs and a bounded repo-inspection prompt.
- `new` creates a numbered change folder from core templates.
- `discuss`, `research`, and `plan` update lifecycle state and generate step-specific prompts.
- `tasks` parses `- [ ] T###: title` and `- [x] T###: title` lines into machine state.
- `execute` selects one task and emits a task-scoped handoff prompt.
- `verify` runs deterministic validators first and writes `verify.md`.
- `handoff` assembles a compact agent handoff from intent, evidence, tasks, and verification output.

## Pack model

- Packs are local directories with `pack.json`.
- The built-in `core` pack currently exposes one `feature` workflow.
- Workflows define artifact sets for `lite` and `full` modes.
- Templates are Markdown skeletons; machine-readable manifests are JSON.

## OMP integration

- `installOmpAdapter` writes project-local OMP extension files, four task-agent cards, and an always-on workflow rule.
- The OMP extension registers `/specwright`, dispatches to `runSpecwrightCommand`, updates OMP UI status/notifications, and injects generated prompts as follow-up messages.
- The OMP adapter uses local structural types instead of importing OMP runtime types.

## Validation

- Validators are deterministic and local.
- Current validator codes: `SW001` through `SW008`.
- Validation report format is Markdown with result, issues, and observed output sections.

## Boundaries

- CLI owns deterministic artifact/state operations only.
- OMP owns interactive agent execution.
- Runtime-specific behavior stays behind `src/runtime/omp/*`.
- No non-OMP adapters, remote pack registry, npm distribution mechanics, or standalone web research client exist in this cut.