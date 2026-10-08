"""Grade git-workflow eval runs by inspecting each run's repo and report.

Usage: python grade.py <iteration-dir>
Writes <run-dir>/grading.json for every eval-*/<config>/run-*/ that has a repo.
A store run's repo/ holds code/ and store/ (two git repos) plus gh-log.jsonl from the
fake gh; those runs are graded by check_store().
"""
import json
import re
import subprocess
import sys
from pathlib import Path

INITIAL = "chore: initial project"


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
    return (repo / "code").is_dir() and (repo / "store").is_dir()


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

    elif name == "eval-apply-three-tasks":
        R.append(("Still on feat/add-greeting and main is unchanged",
                  branch == "feat/add-greeting" and main_unchanged(repo), f"branch={branch} main={subjects(repo, 'main')}"))
        subs = subjects(repo, "main..HEAD")
        R.append(("A planning-artifacts commit exists: feat(add-greeting): add planning artifacts",
                  "feat(add-greeting): add planning artifacts" in subs, f"subjects={subs}"))
        per = {t: [s for s in subs if s.startswith(f"feat(add-greeting): task {t}")] for t in ("1.1", "1.2", "2.1")}
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
        amends = [l for l in (git(repo, "reflog", "--all") or "").splitlines() if "(amend)" in l]
        R.append(("No commit was amended", not amends, f"amend entries={amends}"))
    return R


def check_store(name, repo, run):
    """Grade a store run: code, store = repo/code, repo/store; helpers: subjects, status_of, gh_calls."""
    code, store = repo / "code", repo / "store"
    R = []  # (text, passed, evidence)
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
