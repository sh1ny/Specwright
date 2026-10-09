# Spec Delta

## Purpose

Keeps the PR scripts working on every Python version they accept, keeps their failures machine-readable, and makes their prerequisites visible before the PR flow starts.

## ADDED Requirements

### Requirement: Pass records can be written on Python 3.8
`pr-pair.sh pass write` SHALL write its feedback-pass record on every Python version the script accepts (3.8 and later). The record SHALL be UTF-8 JSON with LF line endings, replaced atomically.

#### Scenario: Pass write on Python 3.8
- **WHEN** the only Python on `PATH` is 3.8 and a valid store-backed `pass write` runs
- **THEN** the script exits 0 with `"ok": true`, and the record file exists, parses as JSON and contains no CR bytes

#### Scenario: No Python 3.8 available to the test
- **WHEN** the minimum-runtime test finds no Python 3.8 interpreter
- **THEN** the test is reported as skipped, naming the missing interpreter, not as passed, and an always-run check still confirms that the script's embedded Python passes no `newline=` argument to `write_text` or `read_text`

### Requirement: Unexpected failures keep the JSON error contract
`pr-pair.sh` SHALL report any unexpected exception as one JSON line on stdout with `"ok": false`, `"error": "internal_error"` and a `message` naming the exception type, and SHALL exit 1. Existing structured stops SHALL keep their own error codes and exit statuses.

#### Scenario: Filesystem error during pass write
- **WHEN** `pass write` runs and the record's parent directory path is an existing regular file
- **THEN** stdout is a single JSON line with `"error": "internal_error"`, the exit status is 1, and stderr contains no `Traceback`

#### Scenario: Existing structured stop
- **WHEN** `pass write` runs for a round whose record already exists
- **THEN** it reports the same error code and exit status as before this change

### Requirement: Prerequisites are stated and checked at install
The README prerequisites and install Step 1 SHALL list `bash` with a POSIX userland and `git` as core requirements, and `gh` 2.40+ and Python 3.8+ as requirements of the PR skills. Install SHALL check each one. A missing core requirement SHALL stop the install. A missing PR requirement SHALL be reported as `PR workflow not ready: <missing>` without blocking the install. `specwright-pr` SHALL state the same script dependencies.

#### Scenario: All prerequisites present
- **WHEN** install runs where bash, git, gh 2.45 and Python 3.11 are available
- **THEN** Step 1 passes and the final report shows no `PR workflow not ready` line

#### Scenario: Python missing
- **WHEN** install runs where neither `python3` nor `python` reports version 3.8 or later
- **THEN** the install completes and its report includes `PR workflow not ready: Python 3.8+`
