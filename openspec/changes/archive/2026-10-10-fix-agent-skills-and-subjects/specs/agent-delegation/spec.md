# Spec Delta

## Purpose

Lets the implementer and reviewer agents that Specwright delegates to load the project skills relevant to their work, the same way the orchestrating agent can.

## ADDED Requirements

### Requirement: Delegated agents can load named skills
The Claude Code `specwright-implementer` and `specwright-reviewer` definitions SHALL list the `Skill` tool. Each packet and review request SHALL name the relevant installed skills, each with its resolved `SKILL.md` path. Before working, the agent SHALL load each named skill (Claude: `Skill`; OMP: `read` of the given path). It SHALL load only named skills, never invoke a `specwright-*` workflow skill, and take on no duty the orchestrator owns.

#### Scenario: Claude implementer loads a named skill
- **WHEN** the orchestrator dispatches a task group to `specwright-implementer` in Claude Code with a packet naming the installed skill `flutter-test-architecture`
- **THEN** the agent invokes `Skill` for `flutter-test-architecture` before editing any file, and still does not tick tasks or commit

#### Scenario: OMP reviewer loads a named skill
- **WHEN** a review request to the OMP `specwright-reviewer` names the skill `dart-patterns` with the path `C:/Users/dev/.claude/skills/dart-patterns/SKILL.md`
- **THEN** the reviewer reads `C:/Users/dev/.claude/skills/dart-patterns/SKILL.md` before writing its review, and edits no file other than its review output

#### Scenario: Workflow skills stay with the orchestrator
- **WHEN** an implementer dispatched during apply has `Skill`, and its packet names no `specwright-*` skill
- **THEN** it invokes no `specwright-*` skill and makes no commit

#### Scenario: Named skill is not installed
- **WHEN** a packet names a skill that is not installed or cannot be loaded
- **THEN** the agent's report names that skill as not loaded and does not claim to have followed it

#### Scenario: Packet names no skills
- **WHEN** no project skill applies to a task group
- **THEN** the packet says so, and the agent works without loading a skill

### Requirement: Updated agent definitions need a new session
The install/update completion report and the contributor setup SHALL say that installed skills and agent definitions take effect only in an agent session started after the install. A session that was running during the update SHALL NOT be used as evidence that the agents have the new tools.

#### Scenario: Update changes agent definitions
- **WHEN** the install prompt updates `.claude/agents/specwright-implementer.md` to a version that lists `Skill`
- **THEN** its final report tells the user to start a new agent session before relying on the updated skills and agents

#### Scenario: Old session after update
- **WHEN** the user checks the delegated agents' tools in a session that was already running before the update
- **THEN** the README's guidance identifies that check as invalid and asks for a new session
