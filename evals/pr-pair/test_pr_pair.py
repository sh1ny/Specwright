"""Script tests for skills/specwright-pr/scripts/pr-pair.sh (PR-pair decisions for store-backed changes).

Every test runs the real script against real git repos in a temp dir (GitHub-form
remotes) and the fake gh from evals/fakes/gh.py. Tests that need a working push
reach a local bare repo through `url.<bare>.insteadOf`; none of those exercise
`identity` (git expands insteadOf when it reports a URL). Each pr-pair subcommand
prints one JSON line; exit 0 = answered, 1 = stop (error object), 2 = usage,
3 = GitHub state unknown.

Run: python -m unittest discover evals/pr-pair
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SCRIPT = ROOT / "skills" / "specwright-pr" / "scripts" / "pr-pair.sh"
sys.path.insert(0, str(ROOT / "evals" / "git-workflow"))
import fixtures  # noqa: E402

CODE, STORE = "acme/code", "acme/plans"
BRANCH, CHANGE = "feat/add-greeting", "add-greeting"
ARCHIVE = "openspec/changes/archive/2026-10-07-add-greeting"
SPEC_ARCHIVED = f"{ARCHIVE}/specs/greeting/spec.md"
SPEC_MAIN = "openspec/specs/greeting/spec.md"
MARKER = f"{ARCHIVE}/specwright-change.yaml"
OLD_TEXT, NEW_TEXT = "The system SHOULD greet", "The system SHALL greet"
T0 = "2026-10-08T10:00:00Z"
REV0 = f"11@{T0}"


class Base(unittest.TestCase):
    maxDiff = None

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        (self.tmp / "bin").mkdir()
        fixtures.install_fake_gh(self.tmp)
        self.gh_state = self.tmp / "gh-state.json"
        self.gh_log = self.tmp / "gh-log.jsonl"
        self.gh_state.write_text(json.dumps({"user": "KintsugiBot", "tokens": {"KintsugiBot": "tok-k", "sh1ny": "tok-s"}}),
                                 encoding="utf-8")
        self.state_dir = self.tmp / "state"
        self.extra_env = {}

    # ---- environment -------------------------------------------------------------------------------------
    def env(self):
        e = {k: v for k, v in os.environ.items() if k not in ("GH_TOKEN", "GITHUB_TOKEN", "GH_REPO", "GH_HOST")}
        e.update({"PATH": str(self.tmp / "bin") + os.pathsep + e.get("PATH", ""),
                  "FAKE_GH_STATE": str(self.gh_state), "FAKE_GH_LOG": str(self.gh_log),
                  "SPECWRIGHT_STATE_DIR": str(self.state_dir), "GIT_CONFIG_GLOBAL": os.devnull,
                  "GIT_CONFIG_NOSYSTEM": "1", "GIT_TERMINAL_PROMPT": "0", "PYTHONIOENCODING": "utf-8"})
        e.update(self.extra_env)
        return e

    def git(self, cwd, *args, check=True):
        r = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, env=self.env())
        if check:
            self.assertEqual(r.returncode, 0, f"git {args}: {r.stderr}")
        return r.stdout.strip()

    def pp(self, *args, env=None, expect=0):
        """Run pr-pair.sh; return the parsed JSON line. The exit code must be `expect` (None = any)."""
        e = {**self.env(), **(env or {})}
        r = subprocess.run(["bash", str(SCRIPT), *map(str, args)], capture_output=True, text=True, env=e, cwd=self.tmp)
        lines = r.stdout.strip().splitlines()
        if expect is not None:
            self.assertEqual(r.returncode, expect, f"{args}\nstdout: {r.stdout}\nstderr: {r.stderr}")
        self.assertEqual(len(lines), 1, f"want exactly one JSON line from {args}, got {r.stdout!r} / {r.stderr!r}")
        out = json.loads(lines[0])
        out["_rc"] = r.returncode
        return out

    # ---- git fixtures ------------------------------------------------------------------------------------
    def make_repo(self, name, remote):
        d = self.tmp / name
        d.mkdir()
        self.git(d, "init", "-q", "-b", "main")
        for k, v in (("user.name", "Eval Bot"), ("user.email", "eval@example.invalid"), ("commit.gpgsign", "false")):
            self.git(d, "config", k, v)
        self.commit(d, {"README.md": f"# {name}\n"}, "chore: initial")
        if remote:
            self.git(d, "remote", "add", "origin", remote)
        return d

    def commit(self, repo, files, msg):
        for rel, text in files.items():
            p = Path(repo) / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(text, encoding="utf-8", newline="\n")
        self.git(repo, "add", "-A")
        self.git(repo, "commit", "-q", "-m", msg)
        return self.git(repo, "rev-parse", "HEAD")

    def attach_bare(self, repo, slug):
        """Reach a local bare repo through insteadOf, so `origin` keeps its GitHub-form URL name."""
        bare = self.tmp / (Path(repo).name + ".bare.git")
        self.git(self.tmp, "init", "-q", "--bare", "-b", "main", str(bare))
        self.git(repo, "config", f"url.{fixtures.posix(bare)}.insteadOf", f"https://github.com/{slug}.git")
        self.git(repo, "push", "-q", "origin", "main")
        return bare

    def tip(self, repo, ref=BRANCH):
        return self.git(repo, "rev-parse", f"refs/heads/{ref}")

    # ---- fake gh state -----------------------------------------------------------------------------------
    def gh(self):
        return json.loads(self.gh_state.read_text(encoding="utf-8"))

    def save_gh(self, st):
        self.gh_state.write_text(json.dumps(st), encoding="utf-8")

    def seed_pulls(self, slug, pulls):
        st = self.gh()
        st.setdefault("repos", {}).setdefault(slug, {}).setdefault("pulls", []).extend(pulls)
        self.save_gh(st)

    def pull(self, slug, n, ref=BRANCH, state="open", merged=None, base="main", owner=None, head_repo=None, body="", sha=None):
        owner = owner or slug.split("/")[0]
        return {"number": n, "html_url": f"https://github.com/{slug}/pull/{n}", "state": state, "merged_at": merged,
                "title": f"t{n}", "body": body, "created_at": T0,
                "head": {"ref": ref, "label": f"{owner}:{ref}", "sha": sha or f"{n:040x}",
                         "repo": {"full_name": head_repo or f"{owner}/{slug.split('/')[1]}"}},
                "base": {"ref": base}}

    def add_pull(self, slug, n, **kw):
        self.seed_pulls(slug, [self.pull(slug, n, **kw)])

    def add_comment(self, slug, pr, body, user, cid, created_at=T0):
        st = self.gh()
        st["repos"].setdefault(slug, {}).setdefault("comments", {}).setdefault(str(pr), []).append(
            {"id": cid, "body": body, "user": {"login": user}, "created_at": created_at,
             "html_url": f"https://github.com/{slug}/pull/{pr}#issuecomment-{cid}"})
        self.save_gh(st)

    def comments(self, slug, pr):
        return self.gh().get("repos", {}).get(slug, {}).get("comments", {}).get(str(pr), [])

    def pulls(self, slug):
        return self.gh().get("repos", {}).get(slug, {}).get("pulls", [])

    def pushed_at(self, slug, branch, sha, ts):
        st = self.gh()
        st.setdefault("repos", {}).setdefault(slug, {}).setdefault("activity", []).append(
            {"ref": f"refs/heads/{branch}", "after": sha, "timestamp": ts})
        self.save_gh(st)

    def gh_calls(self):
        if not self.gh_log.exists():
            return []
        return [json.loads(l) for l in self.gh_log.read_text(encoding="utf-8").splitlines()]

    def write(self, rel, text):
        p = self.tmp / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8", newline="\n")
        return p

    def write_json(self, rel, obj):
        return self.write(rel, json.dumps(obj))


def snap(threads=(), comments=(), reviews=(), viewer="KintsugiBot", **over):
    """A pr-snapshot.sh result that passes the readiness test unless overridden."""
    s = {"viewer": viewer, "number": 1, "url": "https://github.com/acme/x/pull/1", "state": "OPEN", "draft": False,
         "mergeable": "MERGEABLE", "merge_state": "CLEAN", "pending_review": False,
         "checks": {"total": 3, "pending": 0, "advisory_pending": 0, "failing": []},
         "threads": list(threads), "comments": list(comments), "reviews": list(reviews), "stale_verdicts": [],
         "reviewers": [{"login": "chatgpt-codex-connector", "role": "required", "timeout": 1200, "state": "reported"}],
         "complete": True, "truncated": []}
    s.update(over)
    return s


def thread(tid="T1", rev=REV0, root_id=11, awaiting=False, resolved=False, resolve_pending=False, waiting_owner=False,
           comments=None):
    return {"id": tid, "root_id": root_id, "resolved": resolved, "rev": rev, "waiting_owner": waiting_owner,
            "awaiting_reviewer": awaiting, "resolve_pending": resolve_pending, "path": "x", "line": 1,
            "comments": comments or [{"id": "C11", "author": "chatgpt-codex-connector", "at": T0, "edited": None}]}


# =======================================================================================================
class Identity(Base):
    def test_identity_fetch_push_mismatch(self):
        d = self.make_repo("store", "https://github.com/team/plans.git")
        self.git(d, "remote", "set-url", "--push", "origin", "https://github.com/publishing/plans.git")
        r = self.pp("identity", d, expect=1)
        self.assertEqual(r["error"], "mismatch")
        self.assertEqual(r["fetch"], "team/plans")
        self.assertEqual(r["push"], ["publishing/plans"])
        self.assertIn("team/plans", r["message"])
        self.assertIn("publishing/plans", r["message"])
        self.assertEqual(self.gh_calls(), [], "a mismatch must stop before any GitHub lookup")

    def test_identity_every_push_url_must_match(self):
        d = self.make_repo("store", "https://github.com/team/plans.git")
        self.git(d, "remote", "set-url", "--push", "origin", "https://github.com/team/plans.git")
        self.git(d, "remote", "set-url", "--add", "--push", "origin", "git@github.com:other/plans.git")
        r = self.pp("identity", d, expect=1)
        self.assertEqual((r["error"], r["push"]), ("mismatch", ["team/plans", "other/plans"]))

    def test_identity_url_forms(self):
        for url in ("https://github.com/team/plans.git", "https://github.com/team/plans", "git@github.com:team/plans.git",
                    "ssh://git@github.com/team/plans.git", "https://x-access-token:tok@github.com/team/plans.git",
                    "ssh://git@ssh.github.com:443/team/plans.git", "git@ssh.github.com:team/plans.git"):
            d = self.make_repo("r" + str(abs(hash(url))), url)
            r = self.pp("identity", d)
            self.assertEqual((r["repo"], r["fetch"], r["push"]), ("team/plans", "team/plans", ["team/plans"]), url)

    def test_identity_not_github(self):
        d = self.make_repo("local", str(self.tmp / "elsewhere.git"))
        self.assertEqual(self.pp("identity", d, expect=1)["error"], "not-github")
        d2 = self.make_repo("gitlab", "https://gitlab.com/team/plans.git")
        self.assertEqual(self.pp("identity", d2, expect=1)["error"], "not-github")
        d3 = self.make_repo("noremote", None)
        self.assertEqual(self.pp("identity", d3, expect=1)["error"], "no-origin")


class Context(Base):
    def setUp(self):
        super().setUp()
        self.code = self.make_repo("code", f"https://github.com/{CODE}.git")
        self.store = self.make_repo("store", f"https://github.com/{STORE}.git")

    def settings(self, text):
        self.write("code/openspec/specwright.yaml", text)

    def test_context_login_per_repo(self):
        self.settings(
            "finish: pr\ngithub:\n  login: sh1ny\n"
            "planning_store:\n  login: KintsugiBot\n  main_branch: trunk\n  validate: \"openspec validate --all --strict\"\n"
            "  reviewers: {}\n"
            "pr:\n  validate: \"python -m unittest\"\n  max_fix_rounds: 3\n  react: true\n"
            "  reviewers:\n    chatgpt-codex-connector: { role: required, request: \"@codex review\" }\n"
            "    kody-ai: { role: advisory, timeout: 15m }\n")
        c = self.pp("context", "--code", self.code, "--store", self.store)
        self.assertEqual(c["code"]["login"], "sh1ny")
        self.assertEqual(c["store"]["login"], "KintsugiBot")
        self.assertEqual(c["code"]["main"], "main")
        self.assertEqual(c["store"]["main"], "trunk")
        self.assertEqual(c["code"]["validate"], "python -m unittest")
        self.assertEqual(c["store"]["validate"], "openspec validate --all --strict")
        self.assertEqual(c["store"]["reviewers"], {})
        self.assertEqual(c["code"]["reviewers"]["chatgpt-codex-connector"], {"role": "required", "timeout": 1200, "request": "@codex review"})
        self.assertEqual(c["code"]["reviewers"]["kody-ai"], {"role": "advisory", "timeout": 900, "request": ""})
        self.assertEqual((c["max_fix_rounds"], c["react"]), (3, True))

    def test_context_store_inherits_defaults(self):
        self.settings("github:\n  login: sh1ny\npr:\n  validate: \"python -m unittest\"\n"
                      "  reviewers:\n    kody-ai: { role: advisory }\n")
        self.git(self.store, "branch", "-m", "master")
        c = self.pp("context", "--code", self.code, "--store", self.store)
        self.assertEqual(c["store"]["login"], "sh1ny")
        self.assertEqual(c["store"]["validate"], "")  # the code validate command is meaningless in the store
        self.assertEqual(c["store"]["reviewers"], c["code"]["reviewers"])
        self.assertEqual((c["code"]["main"], c["store"]["main"]), ("main", "master"))
        self.assertEqual(c["code"]["reviewers"]["kody-ai"]["timeout"], 1200)

    def test_context_block_scalars(self):
        # `|` and `>` values are read whole, and the keys after them still count.
        self.settings("github:\n  login: sh1ny\n"
                      "planning_store:\n  validate: >-\n    openspec validate\n    --all --strict\n\n  login: KintsugiBot\n"
                      "pr:\n  validate: |\n    python -m unittest  # not a comment\n\n    openspec validate --all\n"
                      "  max_fix_rounds: 3\n  reviewers:\n    kody-ai: { role: advisory }\n")
        c = self.pp("context", "--code", self.code, "--store", self.store)
        self.assertEqual(c["code"]["validate"], "python -m unittest  # not a comment\n\nopenspec validate --all\n")
        self.assertEqual(c["store"]["validate"], "openspec validate --all --strict")
        self.assertEqual(c["store"]["login"], "KintsugiBot")
        self.assertEqual(c["max_fix_rounds"], 3)
        self.assertEqual(c["code"]["reviewers"]["kody-ai"]["role"], "advisory")


# =======================================================================================================
class Discover(Base):
    def test_discover_paginates_past_fork_prs(self):
        # 130 newer PRs share the head label (a deleted/other-repo head) and 30 more come from a fork;
        # the change's own PR is the oldest and merged, so it sits on page 2 of the 100-per-page listing.
        noise = [self.pull(CODE, n, head_repo="acme/other-fork") for n in range(11, 141)]
        forks = [self.pull(CODE, n, owner="forker") for n in range(141, 171)]
        own = self.pull(CODE, 3, state="closed", merged="2026-10-01T00:00:00Z")
        self.seed_pulls(CODE, [own, *noise, *forks])
        r = self.pp("discover", "--repo", CODE, "--branch", BRANCH, "--base", "main")
        self.assertEqual([p["number"] for p in r["prs"]], [3])
        self.assertEqual(r["prs"][0]["state"], "MERGED")
        self.assertTrue(r["ok"])
        call = [c for c in self.gh_calls() if c["argv"][:1] == ["api"] and "pulls" in " ".join(c["argv"])][0]["argv"]
        self.assertIn("--paginate", call)
        endpoint = call[-1]
        self.assertTrue(endpoint.startswith(f"repos/{CODE}/pulls?"), endpoint)
        for part in ("state=all", f"head=acme:{BRANCH}", "per_page=100"):
            self.assertIn(part, endpoint)

    def test_discover_filters_base_and_state(self):
        self.seed_pulls(CODE, [self.pull(CODE, 1, state="closed"), self.pull(CODE, 2, base="integration"),
                               self.pull(CODE, 3, state="closed", merged="2026-10-01T00:00:00Z"), self.pull(CODE, 4)])
        nums = lambda *a: [p["number"] for p in self.pp("discover", "--repo", CODE, "--branch", BRANCH, *a)["prs"]]
        self.assertEqual(nums(), [4, 3, 2, 1])
        self.assertEqual(nums("--base", "main"), [4, 3, 1])
        self.assertEqual(nums("--base", "main", "--state", "merged"), [3])
        self.assertEqual(nums("--base", "main", "--state", "open,closed"), [4, 1])
        r = self.pp("discover", "--repo", CODE, "--branch", BRANCH, "--base", "main")
        self.assertEqual([p["number"] for p in r["other_base"]], [2])

    def test_discover_failure_is_unknown(self):
        st = self.gh()
        st["fail"] = [{"match": r"api .*repos/acme/code/pulls", "exit": 1, "stderr": "HTTP 502"}]
        self.save_gh(st)
        r = self.pp("discover", "--repo", CODE, "--branch", BRANCH, expect=3)
        self.assertFalse(r["ok"])
        self.assertTrue(r["unknown"])
        self.assertIn("502", r["message"])


# =======================================================================================================
class Expected(Base):
    """The expected PR set follows the change's work (code PR exists or code commits) and transport (store origin)."""

    def setUp(self):
        super().setUp()
        self.code = self.make_repo("code", f"https://github.com/{CODE}.git")
        self.store = self.make_repo("store", f"https://github.com/{STORE}.git")
        for d in (self.code, self.store):
            self.git(d, "checkout", "-q", "-b", BRANCH)

    def expected(self, **kw):
        return self.pp("expected", "--code", self.code, "--store", self.store, "--branch", BRANCH, **kw)

    def test_expected_planning_only_github_store(self):
        r = self.expected()
        self.assertEqual(r["set"], ["store"])
        self.assertFalse(r["code"]["expected"])
        self.assertEqual(r["code"]["commits"], 0)
        self.assertEqual(r["store"]["repo"], STORE)
        self.assertEqual(r["ship"]["report"], "store_only")
        self.assertIn("no code changes", r["ship"]["note"].lower())

    def test_expected_planning_only_local_store(self):
        self.git(self.store, "remote", "set-url", "origin", str(self.tmp / "plans.git"))
        r = self.expected()
        self.assertEqual(r["set"], [])
        self.assertFalse(r["store"]["expected"])
        self.assertEqual(r["ship"]["report"], "none")
        self.assertIn("by hand", r["ship"]["note"])

    def test_expected_code_only_when_store_has_no_github_origin(self):
        self.git(self.store, "remote", "remove", "origin")
        self.commit(self.code, {"greet.py": "x = 1\n"}, "feat(add-greeting): task 1.1")
        r = self.expected()
        self.assertEqual((r["set"], r["ship"]["report"]), (["code"], "code_only"))

    def test_expected_gains_code_pr_after_code_commit(self):
        self.assertEqual(self.expected()["set"], ["store"])
        self.commit(self.code, {"greet.py": "x = 1\n"}, "fix(add-greeting): address review feedback")
        r = self.expected()
        self.assertEqual(r["set"], ["store", "code"])
        self.assertEqual((r["code"]["commits"], r["code"]["reason"]), (1, "commits"))
        self.assertEqual(r["ship"]["report"], "both")

    def test_expected_mismatched_store_stops_the_set(self):
        self.git(self.store, "remote", "set-url", "--push", "origin", "https://github.com/publishing/plans.git")
        self.assertEqual(self.expected(expect=1)["error"], "mismatch")

    def test_expected_reads_the_store_with_the_store_login(self):
        # a private store only planning_store.login can read: pair-wide calls run as the code login (as.sh) yet still see it
        self.commit(self.code, {"openspec/specwright.yaml": "github:\n  login: KintsugiBot\nplanning_store:\n  login: sh1ny\n"},
                    "chore: settings")
        st = self.gh()
        st.setdefault("repos", {})[STORE] = {"readers": ["sh1ny"]}
        self.save_gh(st)
        self.add_pull(STORE, 3)
        r = self.expected(env={"GH_TOKEN": "tok-k"})
        self.assertEqual(r["store"]["pr"]["number"], 3)
        store_calls = [c for c in self.gh_calls() if any(STORE in a for a in c["argv"])]
        self.assertTrue(store_calls)
        # the code login still reads the code repo itself
        self.assertEqual(r["set"], ["store", "code"])

    def test_expected_stops_when_the_store_login_has_no_credential(self):
        self.commit(self.code, {"openspec/specwright.yaml": "github:\n  login: KintsugiBot\nplanning_store:\n  login: nobody\n"},
                    "chore: settings")
        r = self.expected(env={"GH_TOKEN": "tok-k"}, expect=3)
        self.assertEqual(r["error"], "no_credential")

    def test_expected_unknown_when_lookup_fails(self):
        st = self.gh()
        st["fail"] = [{"match": r"api .*repos/acme/code/pulls", "exit": 1, "stderr": "HTTP 500"}]
        self.save_gh(st)
        self.assertTrue(self.expected(expect=3)["unknown"])


# =======================================================================================================
class Ship(Base):
    """ship = ensure-pr store, ensure-pr code (store URL in its new description), link each PR to the other."""

    def setUp(self):
        super().setUp()
        self.login = "KintsugiBot"

    def ensure(self, slug, title, body, expect=0):
        f = self.write(f"{slug.replace('/', '-')}-body.md", body)
        return self.pp("ensure-pr", "--repo", slug, "--branch", BRANCH, "--base", "main", "--title", title, "--body-file", f,
                       expect=expect)

    def link(self, slug, pr, kind, peer, expect=0):
        return self.pp("link", "--repo", slug, "--pr", pr, "--kind", kind, "--peer-url", peer, "--login", self.login,
                       expect=expect)

    def ship(self, stop_after_store=False):
        s = self.ensure(STORE, f"docs({CHANGE}): plan", "Planning for add-greeting.\n")
        if stop_after_store:
            return s, None
        c = self.ensure(CODE, f"feat({CHANGE}): add greeting", f"Code for add-greeting.\n\nStore PR: {s['pr']['url']}\n")
        self.link(CODE, c["pr"]["number"], "store", s["pr"]["url"])
        self.link(STORE, s["pr"]["number"], "code", c["pr"]["url"])
        return s, c

    def markers(self, slug, pr):
        return [c for c in self.comments(slug, pr) if "<!-- specwright:link " in c["body"]]

    def test_ship_sequence_links_both(self):
        s, c = self.ship()
        self.assertEqual((s["action"], c["action"]), ("created", "created"))
        self.assertIn(s["pr"]["url"], self.pulls(CODE)[0]["body"])  # the code PR description carries the store link
        store_markers = self.markers(STORE, s["pr"]["number"])
        self.assertEqual(len(store_markers), 1)
        self.assertIn(f"<!-- specwright:link code {c['pr']['url']} -->", store_markers[0]["body"])
        self.assertEqual(self.markers(CODE, c["pr"]["number"]), [], "the description already links the store PR")

    def test_link_existing_code_pr_by_comment(self):
        self.add_pull(CODE, 7, body="Hand-written description, no link.")
        self.add_pull(STORE, 2)
        peer = f"https://github.com/{STORE}/pull/2"
        r = self.link(CODE, 7, "store", peer)
        self.assertEqual(r["action"], "created")
        ms = self.markers(CODE, 7)
        self.assertEqual(len(ms), 1)
        self.assertIn(f"<!-- specwright:link store {peer} -->", ms[0]["body"])
        self.assertEqual(self.pulls(CODE)[0]["body"], "Hand-written description, no link.")
        self.assertEqual(self.link(CODE, 7, "store", peer)["action"], "skipped")
        self.assertEqual(len(self.markers(CODE, 7)), 1)
        self.assertFalse([c for c in self.gh_calls() if c["argv"][:2] == ["pr", "edit"]])

    def test_ship_sequence_rerun_is_idempotent(self):
        s1, _ = self.ship(stop_after_store=True)  # an interrupted first run
        self.assertEqual(len(self.pulls(STORE)), 1)
        self.assertEqual(self.pulls(CODE), [])
        s2, c2 = self.ship()
        self.assertEqual((s2["action"], c2["action"]), ("found", "created"))
        self.assertEqual(s2["pr"]["number"], s1["pr"]["number"])
        s3, c3 = self.ship()  # and once more
        self.assertEqual((s3["action"], c3["action"]), ("found", "found"))
        self.assertEqual((len(self.pulls(STORE)), len(self.pulls(CODE))), (1, 1))
        self.assertEqual(len(self.markers(STORE, 1)), 1)
        self.assertEqual(len(self.markers(CODE, 1)), 0)
        self.assertIn(s1["pr"]["url"], self.pulls(CODE)[0]["body"])

    def test_link_updates_own_comment_for_new_peer(self):
        old, new = f"https://github.com/{CODE}/pull/5", f"https://github.com/{CODE}/pull/6"
        self.add_pull(CODE, 5, state="closed")
        self.add_pull(CODE, 6)
        self.add_pull(STORE, 2)
        self.add_comment(STORE, 2, f"Code PR: {old}\n\n<!-- specwright:link code {old} -->", self.login, 1500)
        r = self.link(STORE, 2, "code", new)
        self.assertEqual(r["action"], "updated")
        ms = self.markers(STORE, 2)
        self.assertEqual([m["id"] for m in ms], [1500])
        self.assertIn(f"<!-- specwright:link code {new} -->", ms[0]["body"])
        self.assertNotIn(old, ms[0]["body"])
        self.assertEqual(len(self.comments(STORE, 2)), 1)

    def test_link_leaves_other_users_comments_alone(self):
        old, new = f"https://github.com/{CODE}/pull/5", f"https://github.com/{CODE}/pull/6"
        self.add_pull(STORE, 2)
        theirs = f"quoted: <!-- specwright:link code {old} -->"
        self.add_comment(STORE, 2, theirs, "someone-else", 1500)
        r = self.link(STORE, 2, "code", new)
        self.assertEqual(r["action"], "created")
        by_id = {c["id"]: c for c in self.comments(STORE, 2)}
        self.assertEqual(by_id[1500]["body"], theirs)
        self.assertEqual(len(by_id), 2)

    def test_link_skipped_when_description_has_the_link(self):
        peer = f"https://github.com/{STORE}/pull/2"
        self.add_pull(CODE, 7, body=f"See {peer}")
        self.assertEqual(self.link(CODE, 7, "store", peer)["action"], "skipped")
        self.assertEqual(self.comments(CODE, 7), [])

    def test_ensure_pr_stops_on_wrong_base(self):
        self.add_pull(CODE, 9, base="integration")
        r = self.ensure(CODE, "t", "b", expect=1)
        self.assertEqual(r["error"], "wrong_base")
        self.assertEqual((r["pr"]["number"], r["base"]), (9, "integration"))
        self.assertIn("integration", r["message"])
        self.assertEqual(len(self.pulls(CODE)), 1)
        self.assertFalse([c for c in self.gh_calls() if c["argv"][:2] == ["pr", "create"]])

    def test_ensure_pr_replaces_a_closed_unmerged_pr_but_not_a_merged_one(self):
        self.add_pull(CODE, 5, state="closed")
        r = self.ensure(CODE, "t", "b")
        self.assertEqual((r["action"], r["pr"]["number"]), ("created", 6))
        self.add_pull(STORE, 1, state="closed", merged="2026-10-01T00:00:00Z")
        r = self.ensure(STORE, "t", "b", expect=1)
        self.assertEqual(r["error"], "already_merged")
        self.assertEqual(len(self.pulls(STORE)), 1)

    def test_gh_repo_env_ignored(self):
        # GH_REPO names the code repo; every store lookup must still hit the store's origin repository
        self.add_pull(STORE, 9, body="store pr")
        env = {"GH_REPO": CODE}
        d = self.pp("discover", "--repo", STORE, "--branch", BRANCH, "--base", "main", env=env)
        self.assertEqual([p["url"] for p in d["prs"]], [f"https://github.com/{STORE}/pull/9"])
        e = self.pp("ensure-pr", "--repo", STORE, "--branch", BRANCH, "--base", "main", "--title", "t",
                    "--body-file", self.write("b.md", "b"), env=env)
        self.assertEqual((e["action"], e["pr"]["number"]), ("found", 9))
        self.pp("link", "--repo", STORE, "--pr", 9, "--kind", "code", "--peer-url", f"https://github.com/{CODE}/pull/1",
                "--login", self.login, env=env)
        self.assertEqual(len(self.comments(STORE, 9)), 1)
        self.assertEqual(self.comments(CODE, 9), [])
        self.assertEqual(self.pulls(CODE), [])
        calls = self.gh_calls()
        self.assertTrue(calls)
        for c in calls:
            self.assertIsNone(c["gh_repo"], f"GH_REPO must be unset for {c['argv']}")
            a = c["argv"]
            if a[0] == "api":
                self.assertTrue(any(x.startswith("repos/") for x in a) or "user" in a, f"unscoped api call {a}")
            if a[0] == "pr":
                self.assertTrue("--repo" in a or "-R" in a, f"pr command without --repo: {a}")


# =======================================================================================================
class PairState(Base):
    def setUp(self):
        super().setUp()
        self.code = self.make_repo("code", f"https://github.com/{CODE}.git")
        self.store = self.make_repo("store", f"https://github.com/{STORE}.git")
        for d in (self.code, self.store):
            self.git(d, "checkout", "-q", "-b", BRANCH)

    def state(self, code=None, store=None, dropped=(), expect=0):
        args = ["pair-state", "--code", self.code, "--store", self.store, "--branch", BRANCH]
        for name, s in (("code", code), ("store", store)):
            if s is not None:
                args += ["--snapshot", f"{name}={self.write_json(f'{name}-snap.json', s)}"]
        for d in dropped:
            args += ["--dropped", d]
        return self.pp(*args, expect=expect)

    def test_pair_state_waits_for_both(self):
        self.commit(self.code, {"greet.py": "x = 1\n"}, "feat(add-greeting): task 1.1")
        self.add_pull(CODE, 1)
        self.add_pull(STORE, 1)
        unresolved = thread(comments=[{"id": "C1", "author": "chatgpt-codex-connector", "at": T0, "edited": None}])
        r = self.state(code=snap(), store=snap(threads=[unresolved]))
        self.assertEqual(r["set"], ["store", "code"])
        self.assertEqual(r["action"], "wait")
        self.assertEqual(r["ready"], {"code": True, "store": False})
        self.assertEqual(r["waiting_on"], ["store"])
        self.assertIn("threads", r["blocking"]["store"])
        self.assertEqual(sorted(r["waits"]), ["code", "store"])

    def test_pair_state_ready_only_when_both_pass(self):
        self.commit(self.code, {"greet.py": "x = 1\n"}, "feat(add-greeting): task 1.1")
        self.add_pull(CODE, 1)
        self.add_pull(STORE, 1)
        r = self.state(code=snap(), store=snap())
        self.assertEqual((r["action"], r["ready"]), ("ready", {"code": True, "store": True}))
        r = self.state(code=snap(checks={"total": 2, "pending": 1, "advisory_pending": 0, "failing": []}), store=snap())
        self.assertEqual((r["action"], r["waiting_on"]), ("wait", ["code"]))
        # a dropped item (id@rev) does not block
        t = thread()
        r = self.state(code=snap(), store=snap(threads=[t]), dropped=[f"T1@{REV0}"])
        self.assertEqual(r["action"], "ready")

    def test_pair_state_single_store_pr_ready(self):
        self.add_pull(STORE, 1)
        r = self.state(store=snap())
        self.assertEqual(r["set"], ["store"])
        self.assertEqual((r["action"], r["ready"]), ("ready", {"store": True}))
        self.assertFalse(r.get("share_store_by_hand"))

    def test_pair_state_code_only_names_the_store_branch(self):
        self.git(self.store, "remote", "remove", "origin")
        self.commit(self.code, {"greet.py": "x = 1\n"}, "feat(add-greeting): task 1.1")
        self.add_pull(CODE, 1)
        r = self.state(code=snap())
        self.assertEqual((r["set"], r["action"], r["share_store_by_hand"]), (["code"], "ready", True))

    def test_pair_state_empty_set_does_not_watch(self):
        self.git(self.store, "remote", "remove", "origin")
        r = self.state()
        self.assertEqual((r["set"], r["action"]), ([], "no_watch"))

    def test_pair_state_split_hands_off(self):
        self.commit(self.code, {"greet.py": "x = 1\n"}, "feat(add-greeting): task 1.1")
        self.add_pull(CODE, 1)
        self.add_pull(STORE, 1, state="closed", merged="2026-10-08T09:00:00Z")
        r = self.state(code=snap(), store=snap(state="MERGED"))
        self.assertEqual(r["action"], "split_hand_off")
        self.assertTrue(r["stop_waits"])
        self.assertEqual(r["states"], {"store": "MERGED", "code": "OPEN"})
        self.assertEqual((r["merged"], r["open"]), (["store"], ["code"]))
        self.assertFalse(r["archive"])
        self.assertFalse(r["rerequest"])

    def test_pair_state_merged_code_pr_stays_expected(self):
        # the code PR merged and main was pulled: the code branch has no commits after main any more
        self.add_pull(CODE, 5, state="closed", merged="2026-10-08T09:00:00Z")
        self.add_pull(STORE, 2)
        e = self.pp("expected", "--code", self.code, "--store", self.store, "--branch", BRANCH)
        self.assertEqual(e["set"], ["store", "code"])
        self.assertEqual((e["code"]["commits"], e["code"]["reason"]), (0, "pr_exists"))
        r = self.state(store=snap())
        self.assertEqual(r["action"], "split_hand_off")
        self.assertEqual(r["states"], {"store": "OPEN", "code": "MERGED"})
        self.assertTrue(r["stop_waits"])
        self.assertFalse(r["archive"])

    def test_pair_state_every_pr_merged_goes_to_cleanup(self):
        self.add_pull(CODE, 5, state="closed", merged="2026-10-08T09:00:00Z")
        self.add_pull(STORE, 2, state="closed", merged="2026-10-08T09:30:00Z")
        self.assertEqual(self.state()["action"], "cleanup")

    def test_pair_state_missing_pr_needs_ship(self):
        self.commit(self.code, {"greet.py": "x = 1\n"}, "feat(add-greeting): task 1.1")
        self.add_pull(STORE, 1)
        r = self.state(store=snap())
        self.assertEqual((r["action"], r["missing"]), ("ship", ["code"]))


# =======================================================================================================
class Rounds(Base):
    def setUp(self):
        super().setUp()
        self.code = self.make_repo("code", f"https://github.com/{CODE}.git")
        self.store = self.make_repo("store", f"https://github.com/{STORE}.git")
        for d in (self.code, self.store):
            self.git(d, "checkout", "-q", "-b", BRANCH)
        self.write("code/openspec/specwright.yaml", "pr:\n  max_fix_rounds: 2\n")
        self.git(self.code, "add", "-A")
        self.git(self.code, "commit", "-q", "-m", "chore: settings")

    def rounds(self):
        return self.pp("rounds", "--code", self.code, "--store", self.store, "--branch", BRANCH)

    def test_rounds_highest_across_branches(self):
        self.commit(self.store, {"a.md": "1\n"}, "fix(add-greeting): address review feedback\n\nFeedback-Round: 1")
        self.commit(self.code, {"a.py": "2\n"}, "fix(add-greeting): address review feedback\n\nFeedback-Round: 2")
        r = self.rounds()
        self.assertEqual(r["rounds"], 2)
        self.assertEqual((r["code"]["max_trailer"], r["store"]["max_trailer"]), (2, 1))
        self.assertEqual(r["max_fix_rounds"], 2)
        self.assertTrue(r["limit_reached"])

    def test_rounds_below_limit(self):
        self.commit(self.store, {"a.md": "1\n"}, "fix(add-greeting): address review feedback\n\nFeedback-Round: 1")
        r = self.rounds()
        self.assertEqual((r["rounds"], r["limit_reached"]), (1, False))

    def test_rounds_legacy_subject_count_without_trailers(self):
        self.commit(self.code, {"a.py": "1\n"}, "fix(add-greeting): address review feedback")
        self.commit(self.code, {"a.py": "2\n"}, "fix(add-greeting): address review feedback")
        r = self.rounds()
        self.assertEqual((r["rounds"], r["code"]["subject_count"], r["limit_reached"]), (2, 2, True))

    def test_rounds_unpushed_top_round_commits(self):
        for d, slug in ((self.code, CODE), (self.store, STORE)):
            self.attach_bare(d, slug)
            self.git(d, "push", "-q", "origin", BRANCH)
        sha = self.commit(self.store, {"a.md": "1\n"}, "fix(add-greeting): address review feedback\n\nFeedback-Round: 2")
        r = self.rounds()
        self.assertEqual(r["unpushed"], {"store": [sha]})
        self.git(self.store, "push", "-q", "origin", BRANCH)
        self.assertEqual(self.rounds()["unpushed"], {})


# =======================================================================================================
class PassBase(Base):
    """Both repos on BRANCH with a pushed baseline: pushes go to local bare repos behind GitHub-form remotes."""

    def setUp(self):
        super().setUp()
        self.code = self.make_repo("code", f"https://github.com/{CODE}.git")
        self.store = self.make_repo("store", f"https://github.com/{STORE}.git")
        self.attach_bare(self.code, CODE)
        self.attach_bare(self.store, STORE)
        for d in (self.code, self.store):
            self.git(d, "checkout", "-q", "-b", BRANCH)
        self.commit(self.code, {"greet.py": "def greet(n):\n    return n\n"}, "feat(add-greeting): task 1.1")
        self.commit(self.store, {SPEC_ARCHIVED: f"{OLD_TEXT} by name.\n", SPEC_MAIN: f"{OLD_TEXT} by name.\n"},
                    "chore(add-greeting): archive change")
        self.settings("github:\n  login: KintsugiBot\npr:\n  max_fix_rounds: 2\n  react: true\n"
                      "  reviewers:\n    chatgpt-codex-connector: { role: required, request: \"@codex review\" }\n")

    def settings(self, text):
        self.commit(self.code, {"openspec/specwright.yaml": text}, "chore: settings")
        for d in (self.code, self.store):
            self.git(d, "push", "-q", "origin", BRANCH)

    # ---- the record ----
    def finding(self, fid="F1", source="code", dest="store", kind="thread", item="T1", resolve=True, react="+1", edits=None,
                rev=REV0, at=T0):
        if edits is None:
            edits = [{"file": SPEC_ARCHIVED, "contains": [NEW_TEXT], "absent": [OLD_TEXT]},
                     {"file": SPEC_MAIN, "contains": [NEW_TEXT], "absent": [OLD_TEXT]}] if dest == "store" else [
                {"file": "greet.py", "contains": ["strip()"]}]
        return {"id": fid, "source": source, "destination": dest, "kind": kind, "item": item, "root_id": 11,
                "edits": edits, "disposition": {"reply": True, "resolve": resolve, "react": react},
                "revision": {"rev": rev, "last_reviewer_comment": {"id": "C11", "at": at}}}

    def intent(self, findings, rnd=2):
        return {"change": CHANGE, "branch": BRANCH, "round": rnd, "code_repo": CODE,
                "prs": {"code": {"repo": CODE, "number": 5}, "store": {"repo": STORE, "number": 3}},
                "findings": findings}

    def common(self):
        return ["--code", self.code, "--store", self.store, "--code-repo", CODE, "--change", CHANGE]

    def write_record(self, findings, rnd=2, intent=None, expect=0):
        f = self.write_json("intent.json", intent or self.intent(findings, rnd))
        return self.pp("pass", "write", *self.common(), "--intent", f, expect=expect)

    def record_path(self):
        return self.state_dir / "feedback" / f"acme-code-{CHANGE}.json"

    def plan(self, code=None, store=None, sub="plan", expect=0):
        args = ["pass", sub, *self.common()]
        for name, s in (("code", code), ("store", store)):
            args += ["--snapshot", f"{name}={self.write_json(f'{name}-snap.json', s if s is not None else snap())}"]
        return self.pp(*args, expect=expect)

    @staticmethod
    def row(plan, step, repo=None, finding=None):
        rows = [r for r in plan["rows"] if r["step"] == step and (repo is None or r.get("repo") == repo)
                and (finding is None or r.get("finding") == finding)]
        assert len(rows) == 1, f"want one {step}/{repo}/{finding} row in {[(r['step'], r.get('repo'), r.get('finding')) for r in plan['rows']]}"
        return rows[0]

    # ---- progress ----
    def fix_store(self, rnd=2, message="fix(add-greeting): address review feedback"):
        return self.commit(self.store, {SPEC_ARCHIVED: f"{NEW_TEXT} by name.\n", SPEC_MAIN: f"{NEW_TEXT} by name.\n"},
                           f"{message}\n\nFeedback-Round: {rnd}")

    def fix_code(self, rnd=2):
        return self.commit(self.code, {"greet.py": "def greet(n):\n    return n.strip()\n"},
                           f"fix(add-greeting): address review feedback\n\nFeedback-Round: {rnd}")

    def push_all(self, *repos):
        for d in repos or (self.code, self.store):
            self.git(d, "push", "-q", "origin", BRANCH)


class PassPlan(PassBase):
    def test_pass_plan_routes_spec_fix_to_store(self):
        # a reviewer on the code PR asks for a spec change: the fix lands in the store, the reply goes to the code PR
        w = self.write_record([self.finding()])
        self.assertTrue(w["ok"])
        rec = json.loads(self.record_path().read_text(encoding="utf-8"))
        self.assertEqual((rec["round"], rec["heads"]["store"], rec["heads"]["code"]),
                         (2, self.tip(self.store), self.tip(self.code)))
        p = self.plan(code=snap(threads=[thread()]))
        fix = self.row(p, "fix_commit", "store")
        self.assertEqual((fix["state"], fix["trailer"]), ("todo", "Feedback-Round: 2"))
        self.assertEqual(sorted(fix["files"]), sorted([SPEC_ARCHIVED, SPEC_MAIN]))
        self.assertEqual(len(fix["pending_edits"]), 2)
        self.assertNotIn("fix_commit", [(r["step"]) for r in p["rows"] if r.get("repo") == "code"])
        self.assertFalse(p["new_pass_allowed"])
        # once the store fix is committed, push + re-request go to the store PR and the reply to the code PR
        sha = self.fix_store()
        p = self.plan(code=snap(threads=[thread()]))
        self.assertEqual(self.row(p, "fix_commit", "store")["state"], "done")
        self.assertEqual(self.row(p, "push", "store")["state"], "todo")
        rr = self.row(p, "rerequest", "store")
        self.assertEqual(rr["pr"], {"repo": STORE, "number": 3})
        reply = self.row(p, "reply", finding="F1")
        self.assertEqual((reply["state"], reply["pr"]), ("todo", {"repo": CODE, "number": 5}))
        self.assertEqual(reply["link_commit"], {"repo": STORE, "sha": sha})
        self.assertTrue(reply["resolve"])
        self.assertTrue(all(r.get("repo") != "code" or r["step"] == "reply" for r in p["rows"] if r["step"] in ("fix_commit", "push")))

    def test_pass_plan_final_pass_push_pending(self):
        # max_fix_rounds is 2 and pass 2 committed in both repos, but the store push failed
        self.write_record([self.finding("F1", dest="store"), self.finding("F2", dest="code", item="T2", source="store")])
        self.fix_code()
        self.fix_store()
        self.push_all(self.code)
        r = self.pp("rounds", "--code", self.code, "--store", self.store, "--branch", BRANCH)
        self.assertTrue(r["limit_reached"])
        p = self.plan(code=snap(threads=[thread()]), store=snap(threads=[thread("T2")]))
        self.assertEqual(self.row(p, "fix_commit", "code")["state"], "done")
        self.assertEqual(self.row(p, "fix_commit", "store")["state"], "done")
        self.assertEqual(self.row(p, "push", "code")["state"], "done")
        self.assertEqual(self.row(p, "push", "store")["state"], "todo")
        self.assertEqual(self.row(p, "rerequest", "store")["state"], "todo")
        self.assertEqual(self.row(p, "reply", finding="F1")["state"], "todo")
        self.assertFalse(p["new_pass_allowed"])
        self.assertEqual(p["round"], 2)
        self.assertFalse(p["delete_record"])
        self.assertFalse([s for s in p["stops"]], "no after-limit stop: the pass is finished under its own round")

    def test_pass_plan_missing_store_commit(self):
        self.write_record([self.finding("F1", dest="store"), self.finding("F2", dest="code", item="T2", source="store")])
        self.fix_code()
        p = self.plan(code=snap(threads=[thread()]), store=snap(threads=[thread("T2")]))
        self.assertEqual(self.row(p, "fix_commit", "code")["state"], "done")
        store_fix = self.row(p, "fix_commit", "store")
        self.assertEqual((store_fix["state"], store_fix["trailer"]), ("todo", "Feedback-Round: 2"))
        self.assertEqual(p["round"], 2)
        self.assertFalse(p["new_pass_allowed"])
        self.assertFalse([r for r in p["rows"] if r["step"] == "fix_commit" and r["repo"] == "code" and r["state"] != "done"])

    def test_pass_plan_rerequest_and_replies_pending(self):
        self.write_record([self.finding("F1", dest="store"), self.finding("F2", dest="code", item="T2", source="store")])
        self.fix_code()
        self.fix_store()
        self.push_all()
        self.pushed_at(CODE, BRANCH, self.tip(self.code), "2026-10-08T12:00:00Z")
        self.pushed_at(STORE, BRANCH, self.tip(self.store), "2026-10-08T12:00:05Z")
        p = self.plan(code=snap(threads=[thread()]), store=snap(threads=[thread("T2")]))
        for repo in ("code", "store"):
            self.assertEqual(self.row(p, "fix_commit", repo)["state"], "done")
            self.assertEqual(self.row(p, "push", repo)["state"], "done")
            rr = self.row(p, "rerequest", repo)
            self.assertEqual(rr["state"], "todo")
            self.assertEqual(rr["requests"][0]["body"], "@codex review")
        self.assertEqual(self.row(p, "reply", finding="F1")["state"], "todo")
        self.assertEqual(self.row(p, "reply", finding="F2")["state"], "todo")
        self.assertFalse(p["delete_record"])
        # a request posted after the push is found by the timestamp rule and is not posted again
        self.add_comment(STORE, 3, "@codex review", "KintsugiBot", 2001, created_at="2026-10-08T12:00:06Z")
        self.add_comment(CODE, 5, "@codex review", "KintsugiBot", 2002, created_at="2026-10-08T11:59:59Z")  # before the push
        p = self.plan(code=snap(threads=[thread()]), store=snap(threads=[thread("T2")]))
        self.assertEqual(self.row(p, "rerequest", "store")["state"], "done")
        self.assertEqual(self.row(p, "rerequest", "code")["state"], "todo")

    def test_pass_plan_commit_found_by_trailer(self):
        self.write_record([self.finding("F1", dest="code", source="code", edits=[{"file": "greet.py", "contains": ["strip()"]}])])
        p = self.plan(code=snap(threads=[thread()]))
        self.assertEqual(self.row(p, "fix_commit", "code")["state"], "todo")
        # a commit after the recorded head without the trailer is not the pass's fix
        self.commit(self.code, {"other.py": "x = 1\n"}, "fix(add-greeting): unrelated")
        p = self.plan(code=snap(threads=[thread()]))
        self.assertEqual(self.row(p, "fix_commit", "code")["state"], "todo")
        sha = self.fix_code()
        p = self.plan(code=snap(threads=[thread()]))
        fix = self.row(p, "fix_commit", "code")
        self.assertEqual((fix["state"], fix["sha"]), ("done", sha))
        self.assertEqual(self.row(p, "push", "code")["state"], "todo")
        self.assertEqual(self.row(p, "reply", finding="F1")["state"], "todo")
        self.assertEqual(self.git(self.code, "rev-list", "--count", f"{json.loads(self.record_path().read_text(encoding='utf-8'))['heads']['code']}..HEAD"), "2")

    def test_pass_plan_reply_done_resolution_pending(self):
        self.write_record([self.finding("F1", dest="code", edits=[{"file": "greet.py", "contains": ["strip()"]}])])
        self.fix_code()
        self.push_all()
        self.pushed_at(CODE, BRANCH, self.tip(self.code), "2026-10-08T12:00:00Z")
        self.add_comment(CODE, 5, "@codex review", "KintsugiBot", 2002, created_at="2026-10-08T12:00:03Z")
        answered = thread(awaiting=True, resolve_pending=True,
                          comments=[{"id": "C11", "author": "chatgpt-codex-connector", "at": T0, "edited": None},
                                    {"id": "C12", "author": "KintsugiBot", "at": "2026-10-08T12:01:00Z", "edited": None}],
                          rev="12@2026-10-08T12:01:00Z")
        p = self.plan(code=snap(threads=[answered]))
        self.assertEqual(self.row(p, "reply", finding="F1")["state"], "done")
        res = self.row(p, "resolve", finding="F1")
        self.assertEqual(res["state"], "ask")
        self.assertEqual(res["thread"], "T1")
        self.assertTrue(p["needs_user"])
        self.assertFalse(p["delete_record"])
        self.assertEqual(p["status"], "resume")
        self.assertFalse([r for r in p["rows"] if r["step"] == "reply" and r["state"] == "todo"])
        self.assertTrue(self.record_path().exists())

    def test_pass_plan_stale_disposition_stops(self):
        self.write_record([self.finding("F1", dest="code", edits=[{"file": "greet.py", "contains": ["strip()"]}])])
        self.fix_code()
        self.push_all()
        follow_up = {"id": "C13", "author": "chatgpt-codex-connector", "at": "2026-10-08T12:30:00Z", "edited": None}
        t = thread(rev="13@2026-10-08T12:30:00Z", comments=[
            {"id": "C11", "author": "chatgpt-codex-connector", "at": T0, "edited": None}, follow_up])
        p = self.plan(code=snap(threads=[t]))
        self.assertEqual(p["status"], "stop")
        stop = [s for s in p["stops"] if s["reason"] == "stale_disposition"]
        self.assertEqual(len(stop), 1)
        self.assertEqual(stop[0]["finding"], "F1")
        self.assertEqual([a["id"] for a in stop[0]["new_activity"]], ["C13"])
        reply = self.row(p, "reply", finding="F1")
        self.assertEqual(reply["state"], "stopped")
        self.assertEqual(self.row(p, "resolve", finding="F1")["state"], "stopped")
        self.assertFalse(p["delete_record"])
        # an edit of the finding changes the revision even without a new comment
        edited = thread(rev=f"11@2026-10-08T12:40:00Z", comments=[
            {"id": "C11", "author": "chatgpt-codex-connector", "at": T0, "edited": "2026-10-08T12:40:00Z"}])
        p = self.plan(code=snap(threads=[edited]))
        self.assertEqual([s["reason"] for s in p["stops"]], ["stale_disposition"])

    def test_pass_plan_partial_edit_not_committable(self):
        self.write_record([self.finding()])
        self.write(f"store/{SPEC_ARCHIVED}", f"{NEW_TEXT} by name.\n")  # stopped after the archived delta only
        p = self.plan(code=snap(threads=[thread()]))
        fix = self.row(p, "fix_commit", "store")
        self.assertEqual(fix["state"], "todo")
        self.assertFalse(fix["committable"])
        self.assertEqual(fix["action"], "finish_edits")
        self.assertEqual([e["file"] for e in fix["pending_edits"]], [SPEC_MAIN])
        reply = self.row(p, "reply", finding="F1")
        self.assertEqual(reply["state"], "todo")
        self.assertIn("fix_commit:store", reply["after"])
        self.write(f"store/{SPEC_MAIN}", f"{NEW_TEXT} by name.\n")
        p = self.plan(code=snap(threads=[thread()]))
        fix = self.row(p, "fix_commit", "store")
        self.assertTrue(fix["committable"])
        self.assertEqual(fix["action"], "validate_and_commit")
        self.assertEqual(fix["pending_edits"], [])
        self.assertEqual(sorted(fix["files"]), sorted([SPEC_ARCHIVED, SPEC_MAIN]))

    def test_pass_plan_unrecorded_change_stops(self):
        self.write_record([self.finding()])
        self.write(f"store/{SPEC_ARCHIVED}", f"{NEW_TEXT} by name.\n")
        self.write("store/openspec/specs/other/spec.md", "unrelated edit\n")
        p = self.plan(code=snap(threads=[thread()]))
        self.assertEqual(p["status"], "stop")
        stop = [s for s in p["stops"] if s["reason"] == "unrecorded_change"][0]
        self.assertEqual(stop["repo"], "store")
        self.assertIn("openspec/specs/other/spec.md", stop["files"])
        self.assertFalse(self.row(p, "fix_commit", "store")["committable"])

    def test_pass_plan_unjudgeable_edit_stops(self):
        self.write_record([self.finding(edits=[{"file": SPEC_ARCHIVED}])])
        p = self.plan(code=snap(threads=[thread()]))
        self.assertEqual([s["reason"] for s in p["stops"]], ["edit_unjudgeable"])
        self.assertFalse(self.row(p, "fix_commit", "store")["committable"])

    def test_pass_plan_rerequest_not_applicable(self):
        self.settings("github:\n  login: KintsugiBot\npr:\n  max_fix_rounds: 2\n")  # no review_request.body, no reviewers
        self.write_record([self.finding("F1", dest="code", edits=[{"file": "greet.py", "contains": ["strip()"]}], react=None)])
        self.fix_code()
        self.push_all()
        p = self.plan(code=snap(threads=[]))  # the thread is gone from the snapshot: replied and resolved
        self.assertEqual(self.row(p, "rerequest", "code")["state"], "not_applicable")
        self.assertEqual(self.row(p, "reply", finding="F1")["state"], "done")
        self.assertEqual(self.row(p, "resolve", finding="F1")["state"], "done")
        self.assertTrue(p["delete_record"])
        self.assertEqual(p["status"], "complete")
        self.assertFalse([r for r in p["rows"] if r["state"] in ("todo", "ask", "rerun", "stopped")])
        self.assertEqual([c for c in self.gh_calls() if "comment" in c["argv"] or "POST" in c["argv"]], [])
        d = self.plan(code=snap(threads=[]), sub="done")
        self.assertTrue(d["deleted"])
        self.assertFalse(self.record_path().exists())

    def test_pass_plan_first_code_fix_on_store_only_change_needs_code_pr(self):
        # a store-only change (no code PR) gets a code fix: the pass is not complete until the code PR exists
        intent = {**self.intent([]), "prs": {"store": {"repo": STORE, "number": 3}},
                  "findings": [self.finding("F1", source="store", dest="code", react=None)]}
        self.write_record(None, intent=intent)
        self.fix_code()
        self.push_all()
        p = self.plan(store=snap(threads=[]))
        push = self.row(p, "push", "code")
        self.assertEqual((push["state"], push["action"]), ("todo", "ship"))
        self.assertNotIn("code", p["share_by_hand"])
        self.assertEqual(p["status"], "resume")
        self.assertFalse(p["delete_record"])
        self.plan(store=snap(threads=[]), sub="done", expect=1)
        self.assertTrue(self.record_path().exists())
        # once ship opened the code PR, the pass re-requests review on it and then completes
        self.add_pull(CODE, 7)
        p = self.plan(store=snap(threads=[]))
        self.assertEqual(self.row(p, "push", "code")["state"], "done")
        rr = self.row(p, "rerequest", "code")
        self.assertEqual((rr["pr"], rr["state"]), ({"repo": CODE, "number": 7}, "todo"))
        self.pushed_at(CODE, BRANCH, self.tip(self.code), "2026-10-08T12:00:00Z")
        self.add_comment(CODE, 7, "@codex review", "KintsugiBot", 2003, created_at="2026-10-08T12:00:03Z")
        p = self.plan(store=snap(threads=[]))
        self.assertEqual(p["status"], "complete")
        self.assertTrue(self.plan(store=snap(threads=[]), sub="done")["deleted"])

    def test_pass_plan_question_thread_done_when_replied(self):
        self.settings("github:\n  login: KintsugiBot\npr:\n  max_fix_rounds: 2\n")
        self.write_record([self.finding("F1", dest="code", edits=[{"file": "greet.py", "contains": ["strip()"]}],
                                        resolve=False, react=None)])
        self.fix_code()
        self.push_all()
        answered = thread(awaiting=True, rev="12@2026-10-08T12:01:00Z", comments=[
            {"id": "C11", "author": "chatgpt-codex-connector", "at": T0, "edited": None},
            {"id": "C12", "author": "KintsugiBot", "at": "2026-10-08T12:01:00Z", "edited": None}])
        p = self.plan(code=snap(threads=[answered]))
        self.assertEqual(self.row(p, "reply", finding="F1")["state"], "done")
        self.assertEqual(self.row(p, "resolve", finding="F1")["state"], "not_applicable")
        self.assertTrue(p["delete_record"])
        self.assertFalse(p["needs_user"])

    def test_pass_plan_reaction_is_rerun_after_reply(self):
        self.write_record([self.finding("F1", dest="code", edits=[{"file": "greet.py", "contains": ["strip()"]}], resolve=False)])
        self.fix_code()
        self.push_all()
        self.pushed_at(CODE, BRANCH, self.tip(self.code), "2026-10-08T12:00:00Z")
        self.add_comment(CODE, 5, "@codex review", "KintsugiBot", 2002, created_at="2026-10-08T12:00:03Z")
        answered = thread(awaiting=True, rev="12@2026-10-08T12:01:00Z", comments=[
            {"id": "C11", "author": "chatgpt-codex-connector", "at": T0, "edited": None},
            {"id": "C12", "author": "KintsugiBot", "at": "2026-10-08T12:01:00Z", "edited": None}])
        p = self.plan(code=snap(threads=[answered]))
        react = self.row(p, "react", finding="F1")
        self.assertEqual((react["state"], react["react"], react["comment"]), ("rerun", "+1", 11))
        self.assertTrue(p["delete_record"], "an idempotent reaction re-run does not keep the record")

    def test_pass_plan_removes_marker_before_code_fix(self):
        # the archive carries the planning-only marker; a code fix must delete it in a store commit first
        self.commit(self.store, {MARKER: "code_changes: none\n"}, "chore(add-greeting): archive change marker")
        self.push_all(self.store)
        w = self.write_record([self.finding("F1", dest="code", edits=[{"file": "greet.py", "contains": ["strip()"]}])])
        self.assertEqual(w["marker"], MARKER)
        p = self.plan(code=snap(threads=[thread()]))
        store_fix = self.row(p, "fix_commit", "store")
        self.assertEqual(store_fix["state"], "todo")
        self.assertEqual(store_fix["files"], [MARKER])
        self.assertEqual(store_fix["trailer"], "Feedback-Round: 2")
        code_push = self.row(p, "push", "code")
        self.assertIn("fix_commit:store", code_push["after"])
        self.assertIn("fix_commit:code", code_push["after"])
        self.assertTrue(code_push["blocked"])
        # delete the marker in a store commit: the code push is then unblocked once the code fix is committed too
        (self.store / MARKER).unlink()
        self.git(self.store, "add", "-A")
        self.git(self.store, "commit", "-q", "-m", "fix(add-greeting): remove planning-only marker\n\nFeedback-Round: 2")
        self.fix_code()
        p = self.plan(code=snap(threads=[thread()]))
        self.assertEqual(self.row(p, "fix_commit", "store")["state"], "done")
        code_push = self.row(p, "push", "code")
        self.assertEqual((code_push["state"], code_push["blocked"]), ("todo", False))
        self.assertEqual(self.row(p, "push", "store")["state"], "todo")

    def test_pass_write_finds_the_marker_under_the_selected_root_only(self):
        # another OpenSpec root in the store archives a change of the same name; its marker sorts first and is not ours
        decoy = "aaa/openspec/changes/archive/2026-10-01-add-greeting/specwright-change.yaml"
        self.commit(self.store, {decoy: "code_changes: none\n", MARKER: "code_changes: none\n"}, "chore(add-greeting): archive change marker")
        w = self.write_record([self.finding("F1", dest="code", edits=[{"file": "greet.py", "contains": ["strip()"]}])])
        self.assertEqual(w["marker"], MARKER)

    def test_pass_write_ignores_another_roots_marker(self):
        decoy = "other/changes/archive/2026-10-01-add-greeting/specwright-change.yaml"
        self.commit(self.store, {decoy: "code_changes: none\n"}, "chore: other root archive")
        w = self.write_record([self.finding("F1", dest="code", edits=[{"file": "greet.py", "contains": ["strip()"]}])])
        self.assertIsNone(w["marker"], "a marker outside <store-prefix>/changes/archive/ belongs to another root")

    def test_pass_plan_no_marker_when_only_store_fixes(self):
        self.commit(self.store, {MARKER: "code_changes: none\n"}, "chore(add-greeting): archive change marker")
        w = self.write_record([self.finding()])
        self.assertIsNone(w["marker"])

    def test_pass_plan_without_record(self):
        p = self.plan()
        self.assertEqual((p["ok"], p["record"], p["new_pass_allowed"]), (True, False, True))

    def test_pass_plan_needs_the_snapshot_of_each_source_pr(self):
        self.write_record([self.finding()])
        args = ["pass", "plan", *self.common(), "--snapshot", f"store={self.write_json('s.json', snap())}"]
        r = self.pp(*args, expect=2)
        self.assertEqual(r["error"], "snapshot_required")

    def test_pass_plan_finding_spanning_both_repos(self):
        # one finding needs a spec edit in the store and a code edit: each edit goes to its own repo, one reply covers both
        both = self.finding("F1", dest="both", edits=[
            {"repo": "store", "file": SPEC_ARCHIVED, "contains": [NEW_TEXT], "absent": [OLD_TEXT]},
            {"repo": "store", "file": SPEC_MAIN, "contains": [NEW_TEXT], "absent": [OLD_TEXT]},
            {"repo": "code", "file": "greet.py", "contains": ["strip()"]}])
        self.write_record([both])
        p = self.plan(code=snap(threads=[thread()]))
        sfix, cfix = self.row(p, "fix_commit", "store"), self.row(p, "fix_commit", "code")
        self.assertEqual(sorted(sfix["files"]), sorted([SPEC_ARCHIVED, SPEC_MAIN]))
        self.assertEqual(cfix["files"], ["greet.py"])
        reply = self.row(p, "reply", finding="F1")
        self.assertTrue({"fix_commit:store", "fix_commit:code", "push:store", "push:code"} <= set(reply["after"]))
        s_sha, c_sha = self.fix_store(), self.fix_code()
        p = self.plan(code=snap(threads=[thread()]))
        self.assertEqual((self.row(p, "fix_commit", "store")["state"], self.row(p, "fix_commit", "code")["state"]), ("done", "done"))
        self.push_all()
        p = self.plan(code=snap(threads=[thread()]))
        reply = self.row(p, "reply", finding="F1")
        self.assertEqual(reply["after"], [])
        self.assertEqual(sorted((l["repo"], l["sha"]) for l in reply["link_commits"]), sorted([(CODE, c_sha), (STORE, s_sha)]))

    def test_pass_plan_reads_a_private_store_as_the_store_login(self):
        self.settings("github:\n  login: KintsugiBot\npr:\n  max_fix_rounds: 2\n"
                      "  reviewers:\n    chatgpt-codex-connector: { role: required, request: \"@codex review\" }\n"
                      "planning_store:\n  login: sh1ny\n")
        st = self.gh()
        st.setdefault("repos", {}).setdefault(STORE, {})["readers"] = ["sh1ny"]
        self.save_gh(st)
        self.write_record([self.finding()])
        self.fix_store()
        self.push_all()
        p = self.pp("pass", "plan", *self.common(), "--snapshot", f"code={self.write_json('code-snap.json', snap(threads=[thread()]))}",
                    "--snapshot", f"store={self.write_json('store-snap.json', snap())}", env={"GH_TOKEN": "tok-k"})
        rr = self.row(p, "rerequest", "store")
        self.assertEqual(rr["state"], "todo")
        self.assertIn("push_time", rr)

    def test_pass_write_both_needs_a_repo_per_edit(self):
        bad = self.finding("F1", dest="both", edits=[{"file": "greet.py", "contains": ["x"]}])
        self.assertEqual(self.write_record([bad], expect=2)["error"], "invalid_intent")
        stray = self.finding("F1", dest="both", edits=[{"repo": "store", "file": "greet.py", "contains": ["x"]},
                                                       {"repo": "code", "file": "greet.py", "contains": ["y"]}])
        self.assertEqual(self.write_record([stray], expect=1)["error"], "misrouted")
        self.assertFalse(self.record_path().exists())

    def test_pass_write_refuses_an_existing_record_and_misrouted_edits(self):
        self.write_record([self.finding()])
        self.assertEqual(self.write_record([self.finding()], expect=1)["error"], "record_exists")
        self.record_path().unlink()
        bad = self.finding(edits=[{"file": "greet.py", "contains": ["x"]}])  # destination store, not under openspec/
        self.assertEqual(self.write_record([bad], expect=1)["error"], "misrouted")
        self.assertFalse(self.record_path().exists())


# =======================================================================================================
class Cleanup(Base):
    def setUp(self):
        super().setUp()
        self.code = self.make_repo("code", f"https://github.com/{CODE}.git")
        self.store = self.make_repo("store", f"https://github.com/{STORE}.git")
        for d in (self.code, self.store):
            self.git(d, "checkout", "-q", "-b", BRANCH)
        self.commit(self.code, {"greet.py": "x = 1\n"}, "feat(add-greeting): task 1.1")
        self.commit(self.store, {"openspec/a.md": "a\n"}, "docs(add-greeting): plan")
        self.merged = "2026-10-08T09:00:00Z"

    def plan(self):
        return self.pp("cleanup-plan", "--code", self.code, "--store", self.store, "--branch", BRANCH)

    @staticmethod
    def cmds(entry):
        return [c["cmd"] for c in entry["commands"]]

    def test_cleanup_plan_both_merged(self):
        self.add_pull(CODE, 5, state="closed", merged=self.merged, sha="a" * 40)  # squash: not the local tip
        self.add_pull(STORE, 2, state="closed", merged=self.merged, sha=self.tip(self.store))
        p = self.plan()
        for repo in ("code", "store"):
            e = p[repo]
            self.assertTrue(e["merged"])
            self.assertEqual(self.cmds(e)[:2], [["git", "checkout", "main"], ["git", "pull", "--ff-only"]])
            self.assertEqual(self.cmds(e)[2], ["git", "branch", "-d", BRANCH])
            self.assertEqual(e["commands"][0]["cwd"], str(self.code if repo == "code" else self.store).replace("\\", "/"))
        self.assertFalse(p["code"]["force_delete_allowed"])  # head differs from the local tip: ask
        self.assertTrue(p["store"]["force_delete_allowed"])  # head equals the local tip
        self.assertEqual(p["keep"], [])
        self.assertEqual(p["store"]["force_delete"], ["git", "branch", "-D", BRANCH])

    def test_cleanup_plan_split(self):
        self.add_pull(CODE, 5, state="closed", merged=self.merged)
        self.add_pull(STORE, 2)  # open
        p = self.plan()
        self.assertTrue(p["code"]["merged"])
        self.assertEqual(self.cmds(p["code"])[-1], ["git", "branch", "-d", BRANCH])
        self.assertFalse(p["store"]["merged"])
        self.assertEqual(p["store"]["commands"], [])
        self.assertEqual(len(p["keep"]), 1)
        keep = p["keep"][0]
        self.assertEqual((keep["repo"], keep["state"], keep["branch"]), ("store", "OPEN", BRANCH))
        self.assertEqual(keep["url"], f"https://github.com/{STORE}/pull/2")

    def test_cleanup_plan_rerun_code_branch_gone(self):
        # the code side was cleaned up on an earlier run; now the store PR merged too
        self.git(self.code, "checkout", "-q", "main")
        self.git(self.code, "branch", "-D", BRANCH)
        self.add_pull(CODE, 5, state="closed", merged=self.merged)
        self.add_pull(STORE, 2, state="closed", merged=self.merged, sha=self.tip(self.store))
        p = self.plan()
        self.assertTrue(p["code"]["merged"], "the merged code PR still counts; it is not missing")
        self.assertFalse(p["code"]["branch_exists"])
        self.assertEqual(p["code"]["commands"], [])
        self.assertEqual(self.cmds(p["store"])[:2], [["git", "checkout", "main"], ["git", "pull", "--ff-only"]])
        self.assertEqual(self.cmds(p["store"])[2], ["git", "branch", "-d", BRANCH])
        self.assertEqual(p["keep"], [])

    def test_cleanup_plan_deletes_an_empty_code_branch_with_d(self):
        self.git(self.code, "checkout", "-q", "main")
        self.git(self.code, "branch", "-D", BRANCH)
        self.git(self.code, "branch", BRANCH)  # no commits after main
        self.add_pull(STORE, 2, state="closed", merged=self.merged)
        p = self.plan()
        self.assertFalse(p["code"]["expected"])
        self.assertEqual(self.cmds(p["code"]), [["git", "branch", "-d", BRANCH]])
        self.assertIsNone(p["code"].get("force_delete"))

    def test_cleanup_plan_open_pr_keeps_everything(self):
        self.add_pull(STORE, 2)
        p = self.plan()
        self.assertEqual(p["store"]["commands"], [])
        self.assertEqual(p["code"]["commands"], [])  # code has commits but no PR yet: nothing merged
        self.assertTrue(p["keep"])


if __name__ == "__main__":
    unittest.main()
