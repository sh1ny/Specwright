# 0001. Build on unmodified OpenSpec

- Status: accepted
- Date: 2026-10-09
- Supersedes: —

## Context
Specwright adds architecture triage, review gates, test discipline and a git/PR workflow to OpenSpec. OpenSpec offers a custom-schema extension point and a CLI with JSON output. Users install Specwright into existing projects that already use OpenSpec, and the host agents (Claude Code, Codex, OMP) read skills from different directories.

## Decision
Extend OpenSpec only through a custom schema (`schemas/specwright`), skills, agent definitions and config templates. The README install prompt copies them into each project, and the project's agent follows the installed copies. OpenSpec is pinned (README badge, `CONTRIBUTING.md`) and upgraded deliberately. Today the pin is documentation only: the public install command and the install prompt do not enforce it (sh1ny/specwright#37).

**Rejected: fork OpenSpec or patch its core.** That gives full control of the artifact flow, but every upstream release needs a merge, and users could not combine Specwright with a stock OpenSpec install.

**Reversal cost: high.** Moving to a fork would change installation, the update path and every skill that calls the CLI.

## Consequences
- Specwright can only do what the schema format and the CLI allow. Anything else lives in skill text.
- Installed copies lag the source until the install prompt is re-run, and agent definitions load only at session start. Updating in place has no safe lifecycle yet for sessions already running or for a shared planning store's schema (sh1ny/specwright#36).
- An OpenSpec upgrade is its own change: the badge, the pinned version and the schema fork note change together.
