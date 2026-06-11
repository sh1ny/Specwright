# Architecture

## Overview

Specwright is a file-based workflow kernel for AI-assisted software changes. It manages project/change artifacts, deterministic state, local packs, validators, checkpoint/publish/handoff operations, and OMP integration. The CLI deliberately avoids direct model calls.

## Core directories

- `src/core/`
  - Runtime-neutral domain model, path helpers, JSON IO, slug/id helpers, state management, prompt fragments, validators, git/GitHub helpers, and command engine.
- `src/runtime/omp/`
  - OMP adapter installation, extension registration, status rendering, prompt clauses, args parsing, and structural OMP API types.
- `packs/core/`
  - Built-in core software pack with artifact templates, one feature workflow, lifecycle agent cards, and validator manifest.
- `test/`
  - Bun tests for the kernel and OMP adapter.
- `.specwright/`
  - Project-local generated config, state, project scan docs, change artifacts, cache/tmp, and copied packs.
- `.omp/`
  - Project-local OMP extension, lifecycle agent cards, and workflow rule.

## Data model

- `SpecwrightConfig` describes project defaults, pack roots/enabled packs, lifecycle agent model config, workflow publish settings, and runtime enablement.
- `SpecwrightState` tracks the current change and all known changes.
- `ChangeState` tracks id, slug, title, kind, pack, mode, lifecycle step, status, timestamps, and parsed task state.
- `TaskState` tracks task id, title, status, and update time.
- `PackManifest`, `WorkflowManifest`, and `AgentCard` describe local pack metadata.

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
- `verify` syncs task state, runs deterministic validators, surfaces drift as `SW009`, and writes `verify.md`.
- `checkpoint` stages explicit files and commits a phase/task checkpoint.
- `handoff` assembles a compact agent handoff from intent, evidence, tasks, and verification output.
- `publish` supports `none`, `push`, and `pr` publish modes.

## Pack model

- Packs are local directories with `pack.json`.
- The built-in `core` pack currently exposes one `feature` workflow.
- Workflows define artifact sets for `lite` and `full` modes.
- Templates are Markdown skeletons; machine-readable manifests are JSON.

## OMP integration

- `installOmpAdapter` writes project-local OMP extension files, four lifecycle agent cards, and an always-on workflow rule.
- The OMP extension registers `/specwright`, dispatches to `runSpecwrightCommand`, updates OMP UI status/notifications, and injects generated prompts as follow-up messages.
- The extension registers structured tools for status, checkpoint, and validation.
- A `tool_call` hook blocks lifecycle work unless the next `task` call targets the expected `specwright-{researcher,planner,executor,verifier}` agent.
- The OMP adapter uses local structural types instead of importing OMP runtime types.

## Validation

- Validators are deterministic and local.
- Current validator codes include `SW001` through `SW009`; `SW009` covers unreconciled task drift.
- Validation report format is Markdown with result, issues, and observed output sections.

## Boundaries

- CLI owns deterministic artifact/state operations only.
- OMP owns interactive agent execution.
- Runtime-specific behavior stays behind `src/runtime/omp/*`.
- No non-OMP adapters, remote pack registry, runtime dependency layer, or standalone web research client exists in this cut.