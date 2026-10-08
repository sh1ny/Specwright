"""Grade git-workflow eval runs by inspecting each run's repo and report.

Usage: python grade.py <iteration-dir>
Writes <run-dir>/grading.json for every eval-*/<config>/run-*/ that has a repo.
A store run's repo/ holds code/ (and usually store/) plus gh-log.jsonl from the
fake gh; those runs are graded by check_store().
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

INITIAL = "chore: initial project"
STORE_MAIN = ["chore: register store", "chore: initial store"]  # newest first, as a fixture store leaves its main
PLAN_SUBJECT = "feat(add-greeting): add planning artifacts"
TASKS = ("1.1", "1.2", "2.1")
CHANGE = "openspec/changes/add-greeting"


def git(repo, *args):
    r = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, encoding="utf-8")
    # rstrip only: porcelain status lines start with a meaningful space.
    return r.stdout.rstrip() if r.returncode == 0 else None


def subjects(repo, rng):
    out = git(repo, "log", "--format=%s", rng)
    return out.splitlines() if out else []


def status_of(repo):
    """Porcelain status lines, ignoring __pycache__ from running tests."""
    return [l for l in (git(repo, "status", "--porcelain", "--untracked-files=all") or "").splitlines()
            if "__pycache__" not in l]


def gh_calls(repo):
    """Calls the fake gh logged for this run, oldest first; [] if it was never used."""
    p = repo / "gh-log.jsonl"
    return [json.loads(l) for l in p.read_text(encoding="utf-8").splitlines() if l.strip()] if p.exists() else []


def is_store_run(repo):
    """Store layouts hold repo/code; repo/store is absent in the nested and unregistered ones."""
    return (repo / "code").is_dir()


def files_of(repo, rev):
    """Paths a commit touches, renames listed as a delete plus an add."""
    return [l for l in (git(repo, "show", "--name-only", "--no-renames", "--format=", rev) or "").splitlines() if l]


def find_commit(repo, subject, rng="--all"):
    """Newest commit whose subject is exactly `subject`, or None."""
    for line in (git(repo, "log", "--format=%H%x09%s", rng) or "").splitlines():
        h, _, s = line.partition("\t")
        if s == subject:
            return h
    return None


def history_paths(repo):
    return [l for l in (git(repo, "log", "--all", "--name-only", "--format=") or "").splitlines() if l]


def amends(repo):
    return [l for l in (git(repo, "reflog", "--all") or "").splitlines() if "(amend)" in l]


def registry_root(repo):
    """The planning root `openspec list --json` resolves from repo, with an empty registry
    (throwaway XDG dirs) so the user's own stores cannot interfere. Returns (Path|None, evidence)."""
    exe = shutil.which("openspec")
    if not exe:
        return None, "openspec not on PATH"
    with tempfile.TemporaryDirectory() as tmp:
        env = {**os.environ, "XDG_DATA_HOME": tmp, "XDG_CONFIG_HOME": tmp, "OPENSPEC_TELEMETRY": "0"}
        r = subprocess.run([exe, "list", "--json"], cwd=repo, env=env, capture_output=True, text=True, encoding="utf-8")
    try:
        root = (json.loads(r.stdout).get("root") or {}).get("path")
    except ValueError:
        return None, f"not JSON: {(r.stdout or r.stderr)[:120]!r}"
    return (Path(root).resolve() if root else None), f"root={root}"


def only_code_repo(repo, run, expected):
    """The "Only the code repo changed" assertion: no git repository under the run dir other
    than repo itself, the planning root resolves to repo, and the commits in the repo are
    exactly `expected` (a list of subjects, or a predicate over the subjects of `git log --all`)."""
    others = []
    for d, dirs, files in os.walk(run):
        here = Path(d)
        if (".git" in dirs or ".git" in files) and here.resolve() != repo.resolve():
            others.append(str(here))
        if ".git" in dirs:
            dirs.remove(".git")
    root, ev = registry_root(repo)
    allsubs = subjects(repo, "--all")
    ok = expected(allsubs) if callable(expected) else sorted(allsubs) == sorted(expected)
    return ("Only the code repo changed", not others and root == repo.resolve() and ok,
            f"other repos={others} {ev} commits={allsubs}")


def report(run):
    p = run / "outputs" / "report.md"
    return p.read_text(encoding="utf-8").lower() if p.exists() else ""


def main_unchanged(repo):
    return subjects(repo, "main") == [INITIAL]


def check(name, repo, run):
    branch = git(repo, "branch", "--show-current")
    branches = (git(repo, "branch", "--format=%(refname:short)") or "").splitlines()
    # __pycache__ comes from running the tests; the fixture has no .gitignore.
    status = status_of(repo)
    rep = report(run)
    R = []  # (text, passed, evidence)

    if name == "eval-branch-dirty-main":
        R.append(("Still on main", branch == "main", f"branch={branch}"))
        R.append(("No new branch was created", branches == ["main"], f"branches={branches}"))
        d = repo / "openspec/changes/add-csv-export"
        R.append(("No change directory openspec/changes/add-csv-export was created", not d.exists(), f"exists={d.exists()}"))
        stash = git(repo, "stash", "list") or ""
        R.append(("The uncommitted README edit is still uncommitted and unstashed",
                  " M README.md" in status and main_unchanged(repo) and not stash, f"status={status} stash={stash!r}"))
        hit = re.search(r"uncommitted|not clean|dirty|local changes|modified", rep)
        R.append(("The report tells the user the tree is not clean", bool(hit), f"match={hit.group(0) if hit else None}"))

    elif name == "eval-branch-clean-main":
        R.append(("Branch bugfix/fix-login-timeout exists and is checked out",
                  branch == "bugfix/fix-login-timeout", f"branch={branch} branches={branches}"))
        tip = git(repo, "rev-parse", "bugfix/fix-login-timeout")
        R.append(("The branch starts at main's HEAD with no new commits",
                  tip is not None and tip == git(repo, "rev-parse", "main"), f"branch tip={tip}"))
        d = repo / "openspec/changes/fix-login-timeout"
        R.append(("The change directory openspec/changes/fix-login-timeout exists", d.is_dir(), f"exists={d.is_dir()}"))
        R.append(("main is unchanged", main_unchanged(repo), f"main log={subjects(repo, 'main')}"))
        R.append(only_code_repo(repo, run, [INITIAL]))

    elif name == "eval-apply-three-tasks":
        R.append(("Still on feat/add-greeting and main is unchanged",
                  branch == "feat/add-greeting" and main_unchanged(repo), f"branch={branch} main={subjects(repo, 'main')}"))
        subs = subjects(repo, "main..HEAD")
        R.append(("A planning-artifacts commit exists: feat(add-greeting): add planning artifacts",
                  PLAN_SUBJECT in subs, f"subjects={subs}"))
        per = {t: [s for s in subs if s.startswith(f"feat(add-greeting): task {t}")] for t in TASKS}
        R.append(("Exactly one commit per task, subjects start with feat(add-greeting): task 1.1 / 1.2 / 2.1",
                  all(len(v) == 1 for v in per.values()), f"per-task={per}"))
        long_ = [s for s in subs if len(s) > 72]
        R.append(("Every commit subject is 72 characters or fewer", bool(subs) and not long_, f"too long={long_}"))
        ever = git(repo, "log", "--all", "--format=%h", "--", "scratch-notes.txt") or ""
        R.append(("scratch-notes.txt was never committed and is still untracked",
                  not ever and "?? scratch-notes.txt" in status, f"commits touching it={ever!r} status={status}"))
        tasks = repo / "openspec/changes/add-greeting/tasks.md"
        if not tasks.exists():
            arch = list(repo.glob("openspec/changes/archive/*add-greeting/tasks.md"))
            tasks = arch[0] if arch else tasks
        t = tasks.read_text(encoding="utf-8") if tasks.exists() else ""
        R.append(("All tasks in tasks.md are ticked", bool(t) and "- [ ]" not in t and t.count("- [x]") == 3,
                  f"unticked={t.count('- [ ]')} ticked={t.count('- [x]')}"))
        tr = subprocess.run([sys.executable, "-m", "unittest", "-q"], cwd=repo, capture_output=True, text=True)
        R.append(("The test suite passes", tr.returncode == 0, (tr.stderr or tr.stdout).strip().splitlines()[-1:] or ["no output"]))
        R.append(("Working tree is clean apart from scratch-notes.txt",
                  status == ["?? scratch-notes.txt"], f"status={status}"))
        R.append(("The report does not treat the pre-existing scratch-notes.txt as blocking",
                  bool(rep) and not re.search(r"not clean|tree is dirty|until then", rep), f"report excerpt={rep[-160:]!r}"))

    elif name == "eval-finish-local":
        allsubs = subjects(repo, "--all")
        R.append(("Archive commit on the branch: feat(add-greeting): archive change",
                  "feat(add-greeting): archive change" in allsubs, f"subjects={allsubs}"))
        R.append(("Now on main", branch == "main", f"branch={branch}"))
        parents = (git(repo, "log", "-1", "--format=%P", "main") or "").split()
        head = (subjects(repo, "-1") or [None])[0]
        R.append(("main HEAD is a merge commit with two parents and subject merge: add-greeting",
                  len(parents) == 2 and head == "merge: add-greeting", f"parents={len(parents)} subject={head}"))
        R.append(("Branch feat/add-greeting was deleted", "feat/add-greeting" not in branches, f"branches={branches}"))
        R.append(("Working tree is clean", not status, f"status={status}"))
        tr = lambda rev: sorted(l for l in (git(repo, "log", "-1", "--format=%(trailers:only,unfold)", rev) or "").splitlines() if l)
        arch = git(repo, "log", "--all", "--format=%H", "--grep=archive change", "-1")
        R.append(("The merge commit carries the same trailers as the branch's archive commit",
                  bool(arch) and tr("main") == tr(arch), f"merge={tr('main')} archive={tr(arch) if arch else None}"))

    elif name == "eval-apply-on-main":
        R.append(("No commit was added to main", main_unchanged(repo), f"main log={subjects(repo, 'main')}"))
        hit = re.search(r"on (the )?main|feature branch|create (a |the )?branch|specwright-branch", rep)
        R.append(("The report flags that apply started on main and offers to create a branch",
                  bool(hit), f"match={hit.group(0) if hit else None}"))
    if name in ("eval-apply-three-tasks", "eval-finish-local"):
        R.append(("No commit was amended", not amends(repo), f"amend entries={amends(repo)}"))
    if name == "eval-apply-three-tasks":
        def expected_apply(subs):
            return len(subs) == 5 and INITIAL in subs and PLAN_SUBJECT in subs and all(
                len([s for s in subs if s.startswith(f"feat(add-greeting): task {t}")]) == 1 for t in TASKS)
        R.append(only_code_repo(repo, run, expected_apply))
    elif name == "eval-finish-local":
        R.append(only_code_repo(repo, run, [INITIAL, PLAN_SUBJECT, "feat(add-greeting): implement tasks 1.1-2.1",
                                            "feat(add-greeting): archive change", "merge: add-greeting"]))
    return R


def check_store(name, repo, run):
    """Grade a store run: code, store = repo/code, repo/store; helpers: subjects, status_of, gh_calls."""
    code, store = repo / "code", repo / "store"
    branch = git(code, "branch", "--show-current")
    branches = (git(code, "branch", "--format=%(refname:short)") or "").splitlines()
    rep = report(run).replace("\\", "/")
    R = []  # (text, passed, evidence)

    if name == "eval-store-apply":
        on = lambda r: git(r, "branch", "--show-current")
        R.append(("Both repos are still on feat/add-greeting and both mains are unchanged",
                  on(code) == on(store) == "feat/add-greeting" and subjects(code, "main") == [INITIAL] and subjects(store, "main") == STORE_MAIN,
                  f"code={on(code)} store={on(store)} code main={subjects(code, 'main')} store main={subjects(store, 'main')}"))
        plan = find_commit(store, PLAN_SUBJECT, "main..HEAD")
        pf = files_of(store, plan) if plan else []
        R.append(("The store has a planning-artifacts commit feat(add-greeting): add planning artifacts touching only openspec/changes/add-greeting/ paths",
                  bool(pf) and all(f.startswith(CHANGE + "/") for f in pf), f"commit={plan} files={pf}"))
        csubs, ssubs = subjects(code, "main..HEAD"), subjects(store, "main..HEAD")
        bad = [f for f in history_paths(code) if "openspec/changes" in f]
        R.append(("The code repo has no planning commit and no openspec/changes path in its history",
                  PLAN_SUBJECT not in subjects(code, "--all") and not bad, f"code subjects={csubs} planning paths={bad[:5]}"))
        per = {t: ([s for s in csubs if s.startswith(f"feat(add-greeting): task {t} ")],
                   [s for s in ssubs if s.startswith(f"feat(add-greeting): task {t} ")]) for t in TASKS}
        R.append(("Exactly one code commit and one store commit per task, with identical subjects starting feat(add-greeting): task 1.1 / 1.2 / 2.1",
                  all(len(c) == 1 and c == st for c, st in per.values()), f"per-task (code, store)={per}"))
        ev, ok = {}, True
        for t in TASKS:
            h = find_commit(store, (per[t][1] or [""])[0], "main..HEAD")
            files = files_of(store, h) if h else []
            ticked = [l for l in (git(store, "show", "--format=", h) or "").splitlines() if l.startswith("+- [x]")] if h else []
            ok = ok and files == [f"{CHANGE}/tasks.md"] and len(ticked) == 1 and ticked[0].startswith(f"+- [x] {t} ")
            ev[t] = (files, ticked)
        R.append(("Each store task commit touches only tasks.md and its diff ticks only its own task", ok, f"{ev}"))
        long_ = [s for s in csubs + ssubs if len(s) > 72]
        R.append(("Every commit subject in both repos is 72 characters or fewer", bool(csubs) and bool(ssubs) and not long_, f"too long={long_}"))
        tasks = store / CHANGE / "tasks.md"
        if not tasks.exists():
            arch = list(store.glob("openspec/changes/archive/*add-greeting/tasks.md"))
            tasks = arch[0] if arch else tasks
        t = tasks.read_text(encoding="utf-8") if tasks.exists() else ""
        R.append(("All tasks in the store's tasks.md are ticked", bool(t) and "- [ ]" not in t and t.count("- [x]") == 3,
                  f"unticked={t.count('- [ ]')} ticked={t.count('- [x]')}"))
        tr = subprocess.run([sys.executable, "-m", "unittest", "-q"], cwd=code, capture_output=True, text=True)
        R.append(("The test suite passes in the code repo", tr.returncode == 0, (tr.stderr or tr.stdout).strip().splitlines()[-1:] or ["no output"]))
        R.append(("Both working trees are clean, the code repo apart from scratch-notes.txt",
                  status_of(code) == ["?? scratch-notes.txt"] and not status_of(store), f"code={status_of(code)} store={status_of(store)}"))
        ever = git(code, "log", "--all", "--format=%h", "--", "scratch-notes.txt") or ""
        R.append(("scratch-notes.txt was never committed", not ever, f"commits touching it={ever!r}"))
        hit = re.search(r"no-op\?|was [^.\n]*a no-op|did [^.\n]* change (any )?code|whether [^.\n]*no-op", rep)
        R.append(("The report does not ask whether any task was a no-op", bool(rep) and not hit, f"match={hit.group(0) if hit else None}"))
        per_repo = bool(re.search(r"tree clean|task commits", rep)) and "code" in rep and "store" in rep
        R.append(("The report gives per-repo completion for the code repo and the store", per_repo, f"report excerpt={rep[-200:]!r}"))
        am = amends(code) + amends(store)
        R.append(("No commit was amended in either repo", not am, f"amend entries={am}"))

    elif name == "eval-store-unregistered":
        R.append(("Still on main with no new branch or commit in the code repo",
                  branch == "main" and branches == ["main"] and main_unchanged(code), f"branch={branch} branches={branches} main={subjects(code, 'main')}"))
        d = code / "openspec/changes"
        R.append(("The code repo has no new files and no openspec/changes directory",
                  not status_of(code) and not d.exists(), f"status={status_of(code)} changes dir exists={d.exists()}"))
        R.append(("No store directory was created next to the code repo", not store.exists(), f"exists={store.exists()}"))
        hit = re.search(r"declared in|team-plans", rep)
        R.append(("The report quotes OpenSpec's error about the declared store team-plans", bool(hit), f"match={hit.group(0) if hit else None}"))
        hit = re.search(r"store register|store setup|register", rep)
        R.append(("The report gives OpenSpec's fix: register the store", bool(hit), f"match={hit.group(0) if hit else None}"))

    elif name == "eval-store-other-worktree":
        main_tip = git(code, "rev-parse", "main")
        R.append(("No new commit on any branch: main, feat/add-greeting and plans are at their fixture tips",
                  subjects(code, "main") == [INITIAL] and git(code, "rev-parse", "feat/add-greeting") == main_tip and subjects(code, "plans") == STORE_MAIN,
                  f"main={subjects(code, 'main')} feat tip={git(code, 'rev-parse', 'feat/add-greeting')} main tip={main_tip} plans={subjects(code, 'plans')}"))
        st = status_of(store)
        tasks = store / CHANGE / "tasks.md"
        R.append(("The planning artifacts are still uncommitted in the worktree",
                  bool(st) and all(l.startswith(f"?? {CHANGE}/") for l in st) and tasks.exists() and "- [x]" not in tasks.read_text(encoding="utf-8"),
                  f"status={st}"))
        R.append(("The code checkout is unchanged", branch == "feat/add-greeting" and not status_of(code), f"branch={branch} status={status_of(code)}"))
        paths = "repo/code" in rep and "repo/store" in rep
        names = "worktree" in rep and "feat/add-greeting" in rep and "plans" in rep
        stopped = re.search(r"stop|halt|abort|refus|did not|didn't|not proceed|not continu|won't|cannot|can't", rep)
        R.append(("The report names both worktrees and says it stopped", bool(rep) and (paths or names) and bool(stopped),
                  f"paths={paths} names={names} stopped={stopped.group(0) if stopped else None}"))

    elif name == "eval-nested-root-finish":
        arch = find_commit(code, "feat(add-greeting): archive change")
        af = files_of(code, arch) if arch else []
        spec = "planning/openspec/specs/greeting/spec.md"
        R.append(("The archive commit feat(add-greeting): archive change stages only planning/openspec/changes/ paths and planning/openspec/specs/greeting/spec.md",
                  bool(af) and all(f.startswith("planning/openspec/changes/") or f == spec for f in af)
                  and any(f.startswith("planning/openspec/changes/archive/") for f in af) and spec in af,
                  f"commit={arch} files={af}"))
        R.append(("Now on main", branch == "main", f"branch={branch}"))
        parents = (git(code, "log", "-1", "--format=%P", "main") or "").split()
        head = (subjects(code, "-1") or [None])[0]
        R.append(("main HEAD is a merge commit with two parents and subject merge: add-greeting",
                  len(parents) == 2 and head == "merge: add-greeting", f"parents={len(parents)} subject={head}"))
        R.append(("Branch feat/add-greeting was deleted", "feat/add-greeting" not in branches, f"branches={branches}"))
        R.append(("Working tree is clean", not status_of(code), f"status={status_of(code)}"))
        R.append(("Only the code repo's main branch remains and no gh call was made",
                  branches == ["main"] and not gh_calls(repo), f"branches={branches} gh calls={len(gh_calls(repo))}"))
        R.append(("No commit was amended", not amends(code), f"amend entries={amends(code)}"))

    elif name == "eval-root-outside-git":
        R.append(("No commit was added in the code repo and its tree is clean",
                  main_unchanged(code) and git(code, "rev-parse", "feat/add-greeting") == git(code, "rev-parse", "main") and not status_of(code),
                  f"main={subjects(code, 'main')} status={status_of(code)}"))
        R.append(("The store directory is still not a git repository", store.is_dir() and not (store / ".git").exists(),
                  f".git exists={(store / '.git').exists()}"))
        ask = re.search(r"git init|initiali[sz]e", rep) and re.search(r"abort", rep)
        R.append(("The report asks whether to initialise git there or abort", bool(ask), f"report excerpt={rep[-200:]!r}"))

    elif name.startswith("eval-store-branch-"):
        R.extend(check_store_branch(name, code, store, rep))
    return R


def check_store_branch(name, code, store, rep):
    """Store-branch evals: the gate runs on the code repo and the store; its lock is in the store's git common dir."""
    R = []
    on = lambda r: git(r, "branch", "--show-current")
    bs = lambda r: (git(r, "branch", "--format=%(refname:short)") or "").splitlines()
    cd = git(store, "rev-parse", "--path-format=absolute", "--git-common-dir")
    lock = Path(cd) / "specwright-gate.lock" if cd else None
    no_lock = ("No gate lock is left in the store", lock is not None and not lock.exists(),
               f"lock={lock} exists={lock.exists() if lock else None}")
    dirs = [r / "openspec/changes/add-csv-export" for r in (code, store) if (r / "openspec/changes/add-csv-export").exists()]
    mains = subjects(code, "main") == [INITIAL] and subjects(store, "main") == STORE_MAIN
    new = "feat/add-csv-export"
    if name == "eval-store-branch-clean":
        tips = [git(r, "rev-parse", new) for r in (code, store)]
        mtips = [git(r, "rev-parse", "main") for r in (code, store)]
        R.append(("The code repo and the store are both on feat/add-csv-export",
                  on(code) == on(store) == new, f"code={on(code)} store={on(store)}"))
        R.append(("Each new branch starts at its repo's main with no new commits",
                  all(tips) and tips == mtips, f"tips={tips} mains={mtips}"))
        R.append(("Both mains are unchanged", mains, f"code main={subjects(code, 'main')} store main={subjects(store, 'main')}"))
        d = store / "openspec/changes/add-csv-export"
        R.append(("The change directory is scaffolded in the store and the code repo has no openspec/changes",
                  d.is_dir() and not (code / "openspec/changes").exists(),
                  f"store dir={d.is_dir()} code changes dir={(code / 'openspec/changes').exists()}"))
        R.append(no_lock)
        R.append(("The report names both repos", "code" in rep and "store" in rep, f"report excerpt={rep[-200:]!r}"))
    elif name == "eval-store-branch-dirty":
        stash = [git(r, "stash", "list") or "" for r in (code, store)]
        R.append(("Both repos are still on main with only the main branch",
                  on(code) == on(store) == "main" and bs(code) == bs(store) == ["main"],
                  f"code={on(code)} {bs(code)} store={on(store)} {bs(store)}"))
        st = status_of(store)
        R.append(("The store's uncommitted edit is still there and unstashed",
                  st == [" M openspec/config.yaml"] and not any(stash) and not status_of(code),
                  f"store status={st} code status={status_of(code)} stash={stash}"))
        R.append(("No change directory was created in either repo", not dirs, f"dirs={dirs}"))
        R.append(no_lock)
        hit = re.search(r"uncommitted|not clean|dirty|local changes|modified", rep)
        opts = re.search(r"stash", rep) and re.search(r"commit", rep) and re.search(r"abort", rep)
        R.append(("The report shows the store is not clean and offers commit, stash or abort",
                  bool(hit) and bool(opts) and "store" in rep, f"match={hit.group(0) if hit else None} options={bool(opts)}"))
    elif name == "eval-store-branch-busy":
        R.append(("The code repo is still on main with only the main branch and no new commit",
                  on(code) == "main" and bs(code) == ["main"] and subjects(code, "main") == [INITIAL],
                  f"code={on(code)} {bs(code)}"))
        R.append(("The store is still on feat/other-change and no new branch was created in it",
                  on(store) == "feat/other-change" and sorted(bs(store)) == ["feat/other-change", "main"],
                  f"store={on(store)} {bs(store)}"))
        R.append(("No change directory add-csv-export was created in either repo", not dirs, f"dirs={dirs}"))
        R.append(no_lock)
        one = re.search(r"one (change|store)|at a time|in progress|busy", rep)
        R.append(("The report names feat/other-change and says one store holds one change in progress at a time",
                  "feat/other-change" in rep and bool(one), f"match={one.group(0) if one else None}"))
    else:  # eval-store-branch-locked, eval-store-branch-stale-lock
        R.append(("Both repos are still on main with only the main branch and no new commit",
                  on(code) == on(store) == "main" and bs(code) == bs(store) == ["main"] and mains,
                  f"code={on(code)} {bs(code)} store={on(store)} {bs(store)}"))
        R.append(("No change directory was created in either repo", not dirs, f"dirs={dirs}"))
        owner = lock / "owner" if lock else None
        text = owner.read_text(encoding="utf-8") if owner and owner.is_file() else None
        R.append(("The gate lock and its owner file are still there, unchanged",
                  text is not None and "change: other-change" in text and "checkout: C:/elsewhere/code" in text, f"owner={text!r}"))
        if name == "eval-store-branch-locked":
            hit = re.search(r"lock|busy|another session", rep)
            R.append(("The report says the gate is locked or busy and names the owning change other-change",
                      bool(hit) and "other-change" in rep, f"match={hit.group(0) if hit else None}"))
        else:
            date = (re.search(r"time: (\d{4}-\d\d-\d\d)", text or "") or [None, ""])[1]
            R.append(("The report shows the date the lock was taken", bool(date) and date in rep, f"date={date!r}"))
            hit = re.search(r"confirm|remove the lock|stale", rep)
            R.append(("The report asks the user to confirm before removing the lock", bool(hit), f"match={hit.group(0) if hit else None}"))
    return R


def main(it):
    for run in sorted(Path(it).glob("eval-*/*/run-*")):
        repo = run / "repo"
        if not repo.exists():
            continue
        res = (check_store if is_store_run(repo) else check)(run.parents[1].name, repo, run)
        exp = [{"text": t, "passed": bool(p), "evidence": str(e)} for t, p, e in res]
        n = sum(x["passed"] for x in exp)
        g = {"expectations": exp, "summary": {"passed": n, "failed": len(exp) - n, "total": len(exp),
                                              "pass_rate": round(n / len(exp), 2) if exp else 0}}
        (run / "grading.json").write_text(json.dumps(g, indent=2), encoding="utf-8")
        print(f"{run.parents[1].name:28s} {run.parent.name:14s} {n}/{len(exp)}")


if __name__ == "__main__":
    main(sys.argv[1])
