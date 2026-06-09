# Change

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

- ID: 0008
- Title: Smart subagent routing
- Kind: feature
- Mode: lite
- Pack: core
- Created: 2026-06-09T15:17:04.618Z

## Summary

Teach Specwright's OMP integration to route lifecycle work through dedicated subagents with configurable model roles. The default routing is planner -> `pi/plan`; researcher, executor, and verifier -> `pi/task`. The implementation keeps OMP as the runtime boundary: Specwright installs OMP-compatible agent definitions and prompt instructions, rather than trying to manage subagent execution directly.
