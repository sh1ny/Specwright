# task-commits Specification

## Purpose
Keeps task commit subjects within the project's 72-character limit, measured mechanically rather than estimated, without changing the subject format.

## Requirements

### Requirement: Task subjects fit 72 characters
`specwright-commit` SHALL build each task subject as `<type>(<change-name>): task X.Y <task text>` and measure it mechanically before committing, counting every character of the task text, backticks included. When the subject is longer than 72 characters, it SHALL cut the task text at the last word boundary that keeps the whole subject within 72. A subject that already fits SHALL be used unchanged.

#### Scenario: Long task text with backticks
- **WHEN** task 1.1 of `add-greeting` reads ``Add `greet(name)` with tests test_greet_named and test_greet_empty; ...``
- **THEN** the commit subject is at most 72 characters, starts with `feat(add-greeting): task 1.1 Add`, and ends at a whole word of the task text

#### Scenario: Subject exactly at the limit
- **WHEN** the full subject is exactly 72 characters
- **THEN** the subject is committed unchanged

#### Scenario: Store-backed task pair
- **WHEN** a store-backed task gets a code commit and a store commit
- **THEN** both commits carry the identical fitted subject

### Requirement: Task text is never run as shell input
The subject and message SHALL reach `git commit` through a file, and fitting SHALL read the message from that file, so backticks, `$` and quotes in task text are kept as literal characters and never executed.

#### Scenario: Shell-like task text
- **WHEN** a task's text contains `` `touch pwned` `` and `$(echo hi)`
- **THEN** the committed subject contains those characters literally (cut only at a word boundary), and no file named `pwned` is created

### Requirement: Unfittable subject stops the commit
When not even the first word of the task text fits after the `<type>(<change-name>): task X.Y ` prefix within 72 characters, `specwright-commit` SHALL make no commit for that task and SHALL report the task, the subject and the limit.

#### Scenario: Prefix plus first word too long
- **WHEN** the change name is so long that the prefix and the task text's first word exceed 72 characters
- **THEN** no commit is made for the task, the task's files stay uncommitted, and the report names the task and the 72-character limit
