# Change

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

- ID: 0010
- Title: Strengthen Specwright OMP lifecycle subagent routing guardrails so orchestrator
- Kind: bugfix
- Mode: lite
- Pack: core
- Created: 2026-06-09T20:06:58.070Z

## Summary

Strengthen Specwright's OMP lifecycle routing prompts so the receiving top-level agent behaves as an orchestrator for routed lifecycle steps instead of silently absorbing researcher, planner, executor, or verifier work inline.

This fixes weak-model behavior observed with models such as `kimi-2.6`: the model sees the current broad fallback in `renderLifecycleSpawnStrategy()` and starts implementing directly instead of spawning the configured `specwright-*` subagent.

The change should adapt Specwright's own prompt style and artifact model. Do not copy GSD-core prompt text verbatim. Preserve the existing OMP-native design: generated `.omp/agents/specwright-*.md` files carry `model` frontmatter and `spawns: []`; lifecycle prompts route through OMP's `task` tool because the extension API only sends plain user messages today.