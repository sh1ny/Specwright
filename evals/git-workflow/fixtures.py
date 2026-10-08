"""Build scratch git repos for the git-workflow evals.

Usage: python fixtures.py <eval-name> <dest-dir>
Each fixture is a small Python project with OpenSpec + Specwright settings
(finish: local) and a deterministic git state for one scenario.
Store fixtures (eval-store-*) make <dest>/code and <dest>/store instead, plus
<dest>/eval.env. Source it before running anything, with <dest>/code as the
working directory: it points the OpenSpec registry and config and the
Specwright state at <dest>, so the user's real ones are never touched.
"""
import os
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


def init(repo):
    repo.mkdir(parents=True)
    git(repo, "init", "-q", "-b", "main")
    git(repo, "config", "user.name", "Eval Bot")
    git(repo, "config", "user.email", "eval@example.invalid")
    git(repo, "config", "commit.gpgsign", "false")


def base(repo):
    init(repo)
    shutil.copytree(ROOT / "schemas" / "specwright", repo / "openspec" / "schemas" / "specwright")
    shutil.copy(ROOT / "openspec" / "config.yaml", repo / "openspec" / "config.yaml")
    write(repo, "openspec/specwright.yaml", "finish: local\n")
    write(repo, "openspec/specs/.gitkeep", "")
    project(repo)


def project(repo):
    """The tiny Python project and its first commit; every fixture shares it."""
    write(repo, "greet.py", '"""Greeting helpers."""\n')
    write(repo, "test_greet.py", "import unittest\n\nimport greet  # noqa: F401\n\n\nclass GreetTests(unittest.TestCase):\n    pass\n\n\nif __name__ == '__main__':\n    unittest.main()\n")
    write(repo, "README.md", "# greeter\n\nA tiny greeting library.\n")
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", "chore: initial project")


def posix(p):
    return Path(p).resolve().as_posix()


def msys(p):
    """posix(p) as an MSYS path (/c/x): a drive colon would split a PATH entry in Git Bash."""
    s = posix(p)
    return f"/{s[0].lower()}{s[2:]}" if s[1:2] == ":" else s


def openspec(dest, *args):
    """Run the openspec CLI against the fixture's isolated registry and config."""
    env = {**os.environ, "XDG_DATA_HOME": posix(dest / "xdg-data"), "XDG_CONFIG_HOME": posix(dest / "xdg-config"),
           "OPENSPEC_TELEMETRY": "0"}
    subprocess.run([shutil.which("openspec") or "openspec", *args], cwd=dest, env=env, check=True, capture_output=True, text=True)


def env_file(dest, **extra):
    """Write <dest>/eval.env; once it exists, later calls append (install_fake_gh adds its variables)."""
    p = dest / "eval.env"
    if not p.exists():
        extra = {"XDG_DATA_HOME": posix(dest / "xdg-data"), "XDG_CONFIG_HOME": posix(dest / "xdg-config"),
                 "SPECWRIGHT_STATE_DIR": posix(dest / "state"), "PATH": f"{msys(dest / 'bin')}:$PATH", **extra}
    with p.open("a", encoding="utf-8", newline="\n") as f:
        f.writelines(f'export {k}="{v}"\n' for k, v in extra.items())


def install_fake_gh(dest):
    """Put the fake gh on the fixture's PATH; its state and call log live in <dest>."""
    write(dest, "bin/gh", f'#!/bin/sh\nexec python "{posix(ROOT / "evals" / "fakes" / "gh.py")}" "$@"\n')
    (dest / "bin" / "gh").chmod(0o755)
    env_file(dest, FAKE_GH_STATE=posix(dest / "gh-state.json"), FAKE_GH_LOG=posix(dest / "gh-log.jsonl"))


def store_base(dest, store_id="team-plans", pointer=True):
    """<dest>/code (the project; its openspec/config.yaml points at the store when `pointer`,
    otherwise the store is the global defaultStore) and <dest>/store (a registered store
    holding the schema, trigger config and specs). Both are clean on main."""
    code, store = dest / "code", dest / "store"
    init(code)
    write(code, "openspec/specwright.yaml", "finish: local\n")
    if pointer:
        write(code, "openspec/config.yaml", f"store: {store_id}\n")
    project(code)
    init(store)
    shutil.copytree(ROOT / "schemas" / "specwright", store / "openspec" / "schemas" / "specwright")
    shutil.copy(ROOT / "openspec" / "config.yaml", store / "openspec" / "config.yaml")
    write(store, "openspec/specs/.gitkeep", "")
    git(store, "add", "-A")
    git(store, "commit", "-q", "-m", "chore: initial store")
    (dest / "bin").mkdir()
    openspec(dest, "store", "register", posix(store), "--id", store_id, "--yes")
    if not pointer:
        openspec(dest, "config", "set", "defaultStore", store_id)
    git(store, "add", "-A")  # registration wrote .openspec-store/store.yaml
    git(store, "commit", "-q", "-m", "chore: register store")
    env_file(dest)


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
    if name == "eval-store-branch-clean":
        return store_base(repo)  # both repos clean on main, store registered, code points at it
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
