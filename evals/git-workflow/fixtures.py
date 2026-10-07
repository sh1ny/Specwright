"""Build scratch git repos for the git-workflow evals.

Usage: python fixtures.py <eval-name> <dest-dir>
Each fixture is a small Python project with OpenSpec + Specwright settings
(finish: local) and a deterministic git state for one scenario.
"""
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # specwright repo


def git(repo, *args):
    subprocess.run(["git", *args], cwd=repo, check=True, capture_output=True, text=True)


def write(repo, rel, text):
    p = repo / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8", newline="\n")


def base(repo):
    repo.mkdir(parents=True)
    git(repo, "init", "-q", "-b", "main")
    git(repo, "config", "user.name", "Eval Bot")
    git(repo, "config", "user.email", "eval@example.invalid")
    git(repo, "config", "commit.gpgsign", "false")
    shutil.copytree(ROOT / "schemas" / "specwright", repo / "openspec" / "schemas" / "specwright")
    shutil.copy(ROOT / "openspec" / "config.yaml", repo / "openspec" / "config.yaml")
    write(repo, "openspec/specwright.yaml", "finish: local\n")
    write(repo, "openspec/specs/.gitkeep", "")
    write(repo, "greet.py", '"""Greeting helpers."""\n')
    write(repo, "test_greet.py", "import unittest\n\nimport greet  # noqa: F401\n\n\nclass GreetTests(unittest.TestCase):\n    pass\n\n\nif __name__ == '__main__':\n    unittest.main()\n")
    write(repo, "README.md", "# greeter\n\nA tiny greeting library.\n")
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", "chore: initial project")


CHANGE = "openspec/changes/add-greeting"


def change_artifacts(repo):
    write(repo, f"{CHANGE}/.openspec.yaml", "schema: specwright\ncreated: 2026-10-07\n")
    write(repo, f"{CHANGE}/proposal.md", "## Why\n\nUsers need friendly greetings.\n\n## What Changes\n\n- Add `greet` and `farewell`.\n\n## Capabilities\n\n### New Capabilities\n- `greeting`: greeting and farewell messages\n\n## Impact\n\n`greet.py`, `README.md`.\n")
    write(repo, f"{CHANGE}/specs/greeting/spec.md", "# Spec Delta\n\n## Purpose\n\nProduces greeting and farewell messages for a named person.\n\n## ADDED Requirements\n\n### Requirement: Greeting\nThe system SHALL return `Hello, <name>!` for a non-empty name.\n\n#### Scenario: Named greeting\n- **WHEN** greet is called with `Ada`\n- **THEN** it returns `Hello, Ada!`\n\n#### Scenario: Empty name\n- **WHEN** greet is called with an empty string\n- **THEN** it raises ValueError\n\n### Requirement: Farewell\nThe system SHALL return `Goodbye, <name>!` for a non-empty name.\n\n#### Scenario: Named farewell\n- **WHEN** farewell is called with `Ada`\n- **THEN** it returns `Goodbye, Ada!`\n\n#### Scenario: Empty farewell name\n- **WHEN** farewell is called with an empty string\n- **THEN** it raises ValueError\n")
    write(repo, f"{CHANGE}/design.md", "# Design\n\n## Triage\n\nNo trigger applies: two pure functions in an existing module.\n\nTIER: LIGHT\n\n## Context\n\n`greet.py` is an empty module.\n\n## Decisions\n\n### D1: Validate names with ValueError\n\n- **Choice:** raise ValueError on empty names.\n- **Rejected:** returning a default greeting, because it hides caller bugs.\n- **Reversal cost:** low\n")
    write(repo, f"{CHANGE}/review.md", "# Review\n\n## Metadata\n\n- **Round:** 1\n- **Reviewer:** n/a for SKIPPED_LIGHT\n\nTriage re-checked: no trigger applies.\n\n## Verdict\n\nVERDICT: SKIPPED_LIGHT\n\nCHANGES_APPLIED: n/a\n")
    write(repo, f"{CHANGE}/tasks.md", "# Tasks\n\n## Test map\n\n| Requirement | Scenario | Test file | Test name | State |\n|---|---|---|---|---|\n| greeting → Greeting | Named greeting | test_greet.py | test_greet_named | red |\n| greeting → Greeting | Empty name | test_greet.py | test_greet_empty | red |\n| greeting → Farewell | Named farewell | test_greet.py | test_farewell_named | red |\n| greeting → Farewell | Empty farewell name | test_greet.py | test_farewell_empty | red |\n\n## 1. Greeting functions\n\n- [ ] 1.1 Add `greet(name)` with tests test_greet_named and test_greet_empty; verify `python -m unittest -q` passes\n- [ ] 1.2 Add `farewell(name)` with tests test_farewell_named and test_farewell_empty; verify `python -m unittest -q` passes\n\n## 2. Documentation\n\n- [ ] 2.1 Document greet and farewell in README.md; verify README names both functions\n")


def implemented(repo):
    """Code, tests and README as they would be after apply."""
    write(repo, "greet.py", '"""Greeting helpers."""\n\n\ndef greet(name):\n    if not name:\n        raise ValueError("name is required")\n    return f"Hello, {name}!"\n\n\ndef farewell(name):\n    if not name:\n        raise ValueError("name is required")\n    return f"Goodbye, {name}!"\n')
    write(repo, "test_greet.py", "import unittest\n\nfrom greet import farewell, greet\n\n\nclass GreetTests(unittest.TestCase):\n    def test_greet_named(self):\n        self.assertEqual(greet('Ada'), 'Hello, Ada!')\n\n    def test_greet_empty(self):\n        with self.assertRaises(ValueError):\n            greet('')\n\n    def test_farewell_named(self):\n        self.assertEqual(farewell('Ada'), 'Goodbye, Ada!')\n\n    def test_farewell_empty(self):\n        with self.assertRaises(ValueError):\n            farewell('')\n\n\nif __name__ == '__main__':\n    unittest.main()\n")
    write(repo, "README.md", "# greeter\n\nA tiny greeting library.\n\n- `greet(name)` returns `Hello, <name>!`.\n- `farewell(name)` returns `Goodbye, <name>!`.\n")


def build(name, repo):
    base(repo)
    if name == "eval-branch-dirty-main":
        write(repo, "README.md", "# greeter\n\nA tiny greeting library. WIP edit.\n")
    elif name == "eval-branch-clean-main":
        pass
    elif name in ("eval-apply-three-tasks", "eval-apply-on-main"):
        if name == "eval-apply-three-tasks":
            git(repo, "checkout", "-q", "-b", "feat/add-greeting")
        change_artifacts(repo)  # left uncommitted: the planning commit is under test
        write(repo, "scratch-notes.txt", "personal notes - not part of the change\n")
    elif name == "eval-finish-local":
        git(repo, "checkout", "-q", "-b", "feat/add-greeting")
        change_artifacts(repo)
        git(repo, "add", "-A")
        git(repo, "commit", "-q", "-m", "feat(add-greeting): add planning artifacts")
        implemented(repo)
        tasks = (repo / CHANGE / "tasks.md").read_text(encoding="utf-8")
        write(repo, f"{CHANGE}/tasks.md", tasks.replace("- [ ]", "- [x]").replace("| red |", "| green |"))
        git(repo, "add", "-A")
        git(repo, "commit", "-q", "-m", "feat(add-greeting): implement tasks 1.1-2.1")
        # Simulate a completed vanilla archive: change moved, spec synced, uncommitted.
        archive = repo / "openspec/changes/archive/2026-10-07-add-greeting"
        archive.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(repo / CHANGE), str(archive))
        spec = (archive / "specs/greeting/spec.md").read_text(encoding="utf-8")
        write(repo, "openspec/specs/greeting/spec.md", spec.replace("# Spec Delta", "# greeting Specification").replace("## ADDED Requirements", "## Requirements"))
    else:
        raise SystemExit(f"unknown eval {name}")


if __name__ == "__main__":
    build(sys.argv[1], Path(sys.argv[2]))
