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
from datetime import datetime, timedelta, timezone
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


def code_repo(code, store_id="team-plans", pointer=True):
    """The project repo: Specwright settings, an optional config.yaml pointing at the store
    (otherwise the store is the global defaultStore) and the tiny project. No openspec specs/changes."""
    init(code)
    write(code, "openspec/specwright.yaml", "finish: local\n")
    if pointer:
        write(code, "openspec/config.yaml", f"store: {store_id}\n")
    project(code)


def store_content(root):
    """What a planning root holds: the schema, trigger config and specs (not yet committed)."""
    shutil.copytree(ROOT / "schemas" / "specwright", root / "openspec" / "schemas" / "specwright")
    shutil.copy(ROOT / "openspec" / "config.yaml", root / "openspec" / "config.yaml")
    write(root, "openspec/specs/.gitkeep", "")


def register(dest, root, store_id, pointer=True):
    openspec(dest, "store", "register", posix(root), "--id", store_id, "--yes")
    if not pointer:
        openspec(dest, "config", "set", "defaultStore", store_id)


def store_base(dest, store_id="team-plans", pointer=True, registered=True, store_git=True, store_worktree=False):
    """<dest>/code (the project; its openspec/config.yaml points at the store when `pointer`,
    otherwise the store is the global defaultStore) and <dest>/store (a registered store
    holding the schema, trigger config and specs). Both are clean on main.
    registered=False: no store at all, the pointer dangles (the registry is empty).
    store_git=False: <dest>/store is a plain directory, not a git repo.
    store_worktree: <dest>/store is a worktree of the code repo on branch `plans`."""
    code, store = dest / "code", dest / "store"
    code_repo(code, store_id, pointer)
    (dest / "bin").mkdir()
    if not registered:
        return env_file(dest)
    if store_worktree:
        git(code, "worktree", "add", "-q", "--orphan", "-b", "plans", posix(store))
        git(store, "config", "commit.gpgsign", "false")
    elif store_git:
        init(store)
    else:
        store.mkdir()
    store_content(store)
    if store_git:
        git(store, "add", "-A")
        git(store, "commit", "-q", "-m", "chore: initial store")
    register(dest, store, store_id, pointer)
    if store_git:
        git(store, "add", "-A")  # registration wrote .openspec-store/store.yaml
        git(store, "commit", "-q", "-m", "chore: register store")
    env_file(dest)


def nested_base(dest, store_id="team-plans"):
    """<dest>/code only: the planning root is <dest>/code/planning, registered as a store and
    committed inside the code repo. The top-level openspec/ holds only the pointer config."""
    code = dest / "code"
    code_repo(code, store_id)
    (dest / "bin").mkdir()
    store_content(code / "planning")
    git(code, "add", "-A")
    git(code, "commit", "-q", "-m", "chore: add planning root")
    register(dest, code / "planning", store_id)
    git(code, "add", "-A")
    git(code, "commit", "-q", "-m", "chore: register store")
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


def finished(code, root):
    """On feat/add-greeting: planning commit, implementation commit with ticked tasks, then a
    simulated completed vanilla archive (change moved, spec synced) left uncommitted.
    `root` is the planning root: the code repo itself, or a folder inside it."""
    change = root / CHANGE
    git(code, "checkout", "-q", "-b", "feat/add-greeting")
    change_artifacts(root)
    git(code, "add", "-A")
    git(code, "commit", "-q", "-m", "feat(add-greeting): add planning artifacts")
    implemented(code)
    tasks = (change / "tasks.md").read_text(encoding="utf-8")
    write(root, f"{CHANGE}/tasks.md", tasks.replace("- [ ]", "- [x]").replace("| red |", "| green |"))
    git(code, "add", "-A")
    git(code, "commit", "-q", "-m", "feat(add-greeting): implement tasks 1.1-2.1")
    archive = root / "openspec/changes/archive/2026-10-07-add-greeting"
    archive.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(change), str(archive))
    spec = (archive / "specs/greeting/spec.md").read_text(encoding="utf-8")
    write(root, "openspec/specs/greeting/spec.md", spec.replace("# Spec Delta", "# greeting Specification").replace("## ADDED Requirements", "## Requirements"))


TASK_SUBJECT = {
    "1.1": "feat(add-greeting): task 1.1 Add greet(name)",
    "1.2": "feat(add-greeting): task 1.2 Add farewell(name)",
    "2.1": "feat(add-greeting): task 2.1 Document greet and farewell",
}
VERIFY_TASK = "- [ ] 2.1 Verify the full suite: run `python -m unittest -q` and confirm it passes (verification only, no files change)"


def task_code(code, t):
    """The code files task `t` changes (cumulative: 1.2 builds on 1.1), left uncommitted."""
    if t == "1.1":
        write(code, "greet.py", '"""Greeting helpers."""\n\n\ndef greet(name):\n    if not name:\n        raise ValueError("name is required")\n    return f"Hello, {name}!"\n')
        write(code, "test_greet.py", "import unittest\n\nfrom greet import greet\n\n\nclass GreetTests(unittest.TestCase):\n    def test_greet_named(self):\n        self.assertEqual(greet('Ada'), 'Hello, Ada!')\n\n    def test_greet_empty(self):\n        with self.assertRaises(ValueError):\n            greet('')\n\n\nif __name__ == '__main__':\n    unittest.main()\n")
    elif t == "1.2":
        implemented(code)  # greet.py and test_greet.py are final; README is task 2.1's
        write(code, "README.md", "# greeter\n\nA tiny greeting library.\n")
    elif t == "2.1":
        implemented(code)


def commit_code(code, t):
    task_code(code, t)
    git(code, "add", "-A")
    git(code, "commit", "-q", "-m", TASK_SUBJECT[t])


def tick(store, *tasks):
    """Tick tasks in the store's tasks.md, uncommitted."""
    text = (store / CHANGE / "tasks.md").read_text(encoding="utf-8")
    for t in tasks:
        text = text.replace(f"- [ ] {t} ", f"- [x] {t} ")
    write(store, f"{CHANGE}/tasks.md", text)


def commit_tick(store, t):
    git(store, "add", f"{CHANGE}/tasks.md")
    git(store, "commit", "-q", "-m", TASK_SUBJECT[t])


def apply_base(dest, verify_last=False):
    """store_base, both repos on feat/add-greeting, the planning artifacts committed in the store.
    verify_last: task 2.1 is a verification-only task instead of the README one."""
    code, store = dest / "code", dest / "store"
    store_base(dest)
    for r in (code, store):
        git(r, "checkout", "-q", "-b", "feat/add-greeting")
    change_artifacts(store)
    if verify_last:
        text = (store / CHANGE / "tasks.md").read_text(encoding="utf-8")
        line = next(l for l in text.splitlines() if l.startswith("- [ ] 2.1 "))
        write(store, f"{CHANGE}/tasks.md", text.replace(line, VERIFY_TASK).replace("## 2. Documentation", "## 2. Verification"))
    git(store, "add", "-A")
    git(store, "commit", "-q", "-m", "feat(add-greeting): add planning artifacts")


def done_pair(dest, t):
    """Task t finished normally: code commit, then the store tick with the same subject."""
    commit_code(dest / "code", t)
    tick(dest / "store", t)
    commit_tick(dest / "store", t)


def gate_lock(store, when, change="other-change", checkout="C:/elsewhere/code"):
    """Another session's gate lock in the store's git common dir, taken at `when` (a datetime)."""
    r = subprocess.run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], cwd=store,
                       check=True, capture_output=True, text=True)
    lock = Path(r.stdout.strip()) / "specwright-gate.lock"
    lock.mkdir()
    (lock / "owner").write_text(f"time: {when.isoformat(timespec='seconds')}\nchange: {change}\ncheckout: {checkout}\n",
                                encoding="utf-8", newline="\n")


def build_store(name, dest):
    """Fixtures whose planning lives outside the code repo (or in a folder inside it)."""
    code, store = dest / "code", dest / "store"
    if name == "eval-store-branch-clean":
        store_base(dest)  # both repos clean on main, store registered, code points at it
    elif name == "eval-store-branch-dirty":
        store_base(dest)
        with (store / "openspec/config.yaml").open("a", encoding="utf-8", newline="\n") as f:
            f.write("# local edit, not committed\n")  # tracked store file outside the change dir
    elif name == "eval-store-branch-busy":
        store_base(dest)
        git(store, "checkout", "-q", "-b", "feat/other-change")
        write(store, "openspec/changes/other-change/proposal.md", "## Why\n\nAnother change in progress.\n")
        git(store, "add", "-A")
        git(store, "commit", "-q", "-m", "feat(other-change): add planning artifacts")
    elif name == "eval-store-branch-locked":
        store_base(dest)
        gate_lock(store, datetime.now(timezone.utc))  # another session is in its gate right now
    elif name == "eval-store-branch-stale-lock":
        store_base(dest)
        gate_lock(store, datetime.now(timezone.utc) - timedelta(days=2))  # left by an interrupted session
    elif name == "eval-store-apply":
        store_base(dest)
        for r in (code, store):
            git(r, "checkout", "-q", "-b", "feat/add-greeting")
        change_artifacts(store)  # planning lives in the store, uncommitted
        write(code, "scratch-notes.txt", "personal notes - not part of the change\n")
    elif name == "eval-store-apply-wrong-branch":
        store_base(dest)
        git(code, "checkout", "-q", "-b", "feat/add-greeting")  # the store stays on main
        change_artifacts(store)  # planning artifacts uncommitted on the store's main
    elif name == "eval-store-apply-reconcile":
        apply_base(dest)  # 1.1: code commit made, the store commit failed (tick uncommitted)
        commit_code(code, "1.1")
        tick(store, "1.1")
    elif name == "eval-store-apply-multi-gap":
        apply_base(dest)  # 1.1 and 1.2 have code commits; both ticks sit in one uncommitted tasks.md diff
        commit_code(code, "1.1")
        commit_code(code, "1.2")
        tick(store, "1.1", "1.2")
    elif name == "eval-store-apply-orphan-tick":
        apply_base(dest)  # 1.1 done; 1.2 ticked, its code changes uncommitted: the session stopped before the code commit
        done_pair(dest, "1.1")
        tick(store, "1.2")
        task_code(code, "1.2")
    elif name == "eval-store-apply-noop-gap":
        apply_base(dest, verify_last=True)  # 2.1 is verification-only: ticked, no code commit, store commit failed
        done_pair(dest, "1.1")
        done_pair(dest, "1.2")
        tick(store, "2.1")
    elif name == "eval-store-complete-gap":
        apply_base(dest)  # every task ticked and committed in code; the last store commit failed
        done_pair(dest, "1.1")
        done_pair(dest, "1.2")
        commit_code(code, "2.1")
        tick(store, "2.1")
    elif name == "eval-store-unregistered":
        store_base(dest, registered=False)  # config.yaml says `store: team-plans`; nothing is registered
    elif name == "eval-store-other-worktree":
        store_base(dest, store_worktree=True)  # the store is the `plans` worktree of the code repo
        git(code, "checkout", "-q", "-b", "feat/add-greeting")
        change_artifacts(store)
    elif name == "eval-nested-root-finish":
        nested_base(dest)
        finished(code, code / "planning")
    elif name == "eval-root-outside-git":
        store_base(dest, store_git=False)  # the store is a plain directory
        git(code, "checkout", "-q", "-b", "feat/add-greeting")
        change_artifacts(store)
    else:
        raise SystemExit(f"unknown eval {name}")


def build(name, repo):
    if name.startswith(("eval-store-", "eval-nested-", "eval-root-")):
        return build_store(name, repo)
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
        finished(repo, repo)
    else:
        raise SystemExit(f"unknown eval {name}")


if __name__ == "__main__":
    build(sys.argv[1], Path(sys.argv[2]))
