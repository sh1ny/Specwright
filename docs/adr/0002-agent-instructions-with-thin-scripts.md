# 0002. Agent instructions with thin deterministic scripts

- Status: accepted
- Date: 2026-10-09
- Supersedes: —

## Context
Workflow steps run inside an AI agent on Windows, macOS and Linux, across three harnesses. Some steps need judgement (triage, answering review findings). Others are mechanical and error-prone for a model: paging GitHub, pairing PRs, counting rounds, posting replies idempotently.

## Decision
Skills are short, checkable instructions that the agent follows. Mechanical work that must be exact moves into small scripts that print machine-readable output and signal stop conditions by exit code. Each script documents its output in its header. `pr-snapshot.sh` and `pr-pair.sh` print one JSON document, except that `pr-snapshot.sh --logs` appends plain log text after it. `pr-reply.sh` prints one plain line per action taken (reply URL, resolution, reaction), so a caller can see how far a partial run got. The scripts use only `bash` with a POSIX userland (`sed`, `grep`, `mktemp` and similar), `git`, `gh` (with its built-in jq) and the Python standard library.

**Rejected: a Node/TypeScript CLI, for example one built on Octokit.** It is easier to test and type, but it adds a runtime and a package install to every harness and project, and it moves logic out of text the agent can read.

**Reversal cost: medium.** Scripts can be replaced one at a time behind the same JSON contract.

## Consequences
- Script output is a contract: changing a field changes every skill that reads it.
- Logic split between skill text and scripts must stay consistent; `evals/pr-pair/test_skill_text.py` checks the text side.
- Windows needs Git Bash (for the shell and its userland) and a working `python3`.
