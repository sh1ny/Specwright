"""Tests for the fake gh in evals/fakes/gh.py.

Run: python -m unittest discover evals/pr-pair
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent
GH = HERE.parent / "fakes" / "gh.py"
sys.path.insert(0, str(HERE.parent / "git-workflow"))
import fixtures  # noqa: E402

_spec = importlib.util.spec_from_file_location("fake_gh", GH)
fake_gh = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fake_gh)


class FakeGhCase(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.state = self.tmp / "state.json"
        self.logf = self.tmp / "log.jsonl"
        self.seed({"user": "KintsugiBot", "tokens": {"KintsugiBot": "tok-k", "sh1ny": "tok-s"}})

    def seed(self, st):
        self.state.write_text(json.dumps(st), encoding="utf-8")

    def st(self):
        return json.loads(self.state.read_text(encoding="utf-8"))

    def gh(self, *args, env=None, check=True):
        e = {**os.environ, "FAKE_GH_STATE": str(self.state), "FAKE_GH_LOG": str(self.logf)}
        e.pop("GH_TOKEN", None)
        e.pop("GITHUB_TOKEN", None)
        e.pop("GH_REPO", None)
        e.update(env or {})
        r = subprocess.run([sys.executable, str(GH), *args], capture_output=True, text=True, env=e, cwd=self.tmp)
        if check:
            self.assertEqual(r.returncode, 0, r.stderr)
        return r

    def pull(self, n, ref, owner="o", state="open", merged=None):
        return {"number": n, "html_url": f"https://github.com/o/n/pull/{n}", "state": state, "merged_at": merged,
                "title": f"t{n}", "body": "", "head": {"ref": ref, "label": f"{owner}:{ref}", "repo": {"full_name": f"{owner}/n"}},
                "base": {"ref": "main"}}


class Pulls(FakeGhCase):
    def test_pagination_30_vs_paginate(self):
        st = self.st()
        st["repos"] = {"o/n": {"pulls": [self.pull(i, f"b{i}") for i in range(1, 36)]}}
        self.seed(st)
        first = json.loads(self.gh("api", "repos/o/n/pulls?state=open").stdout)
        self.assertEqual(len(first), 30)
        out = self.gh("api", "--paginate", "repos/o/n/pulls?state=open").stdout
        dec, i, pages = json.JSONDecoder(), 0, []
        while i < len(out):
            obj, j = dec.raw_decode(out, i)
            pages.append(obj)
            i = j
            while i < len(out) and out[i].isspace():
                i += 1
        self.assertEqual([len(p) for p in pages], [30, 5])
        small = json.loads(self.gh("api", "repos/o/n/pulls?per_page=10").stdout)
        self.assertEqual(len(small), 10)

    def test_head_filter_excludes_forks_and_state(self):
        st = self.st()
        st["repos"] = {"o/n": {"pulls": [self.pull(1, "feat/x"), self.pull(2, "feat/x", owner="forker"),
                                         self.pull(3, "feat/x", state="closed", merged="2026-01-01T00:00:00Z"),
                                         self.pull(4, "other")]}}
        self.seed(st)
        nums = lambda q: sorted(p["number"] for p in json.loads(self.gh("api", f"repos/o/n/pulls?{q}").stdout))
        self.assertEqual(nums("state=open&head=o:feat/x"), [1])
        self.assertEqual(nums("state=all&head=o:feat/x"), [1, 3])
        self.assertEqual(nums("state=closed&head=forker:feat/x"), [])
        self.assertEqual(nums("state=open&head=forker:feat/x"), [2])

    def test_jq_simple_path(self):
        st = self.st()
        st["repos"] = {"o/n": {"pulls": [self.pull(1, "a"), self.pull(2, "b")]}}
        self.seed(st)
        r = self.gh("api", "repos/o/n/pulls", "--jq", ".[].html_url")
        self.assertEqual(r.stdout.split(), ["https://github.com/o/n/pull/2", "https://github.com/o/n/pull/1"])


class RoundTrip(FakeGhCase):
    def test_create_view_comment_patch(self):
        url = self.gh("pr", "create", "--repo", "o/n", "--head", "feat/y", "--base", "main",
                      "--title", "T", "--body", "B").stdout.strip()
        self.assertEqual(url, "https://github.com/o/n/pull/1")
        v = json.loads(self.gh("pr", "view", url, "--repo", "o/n", "--json", "number,url,state,headRefName,baseRefName,body,title").stdout)
        self.assertEqual(v, {"number": 1, "url": url, "state": "OPEN", "headRefName": "feat/y", "baseRefName": "main", "body": "B", "title": "T"})
        listed = json.loads(self.gh("api", "repos/o/n/pulls?head=o:feat/y").stdout)
        self.assertEqual((listed[0]["head"]["label"], listed[0]["html_url"]), ("o:feat/y", url))
        cu = self.gh("pr", "comment", "1", "--repo", "o/n", "--body", "marker <!-- x -->").stdout.strip()
        cs = json.loads(self.gh("api", "repos/o/n/issues/1/comments").stdout)
        self.assertEqual((len(cs), cs[0]["body"], cs[0]["html_url"]), (1, "marker <!-- x -->", cu))
        p = json.loads(self.gh("api", "-X", "PATCH", f"repos/o/n/issues/comments/{cs[0]['id']}", "-f", "body=edited").stdout)
        self.assertEqual(p["body"], "edited")
        self.assertEqual(json.loads(self.gh("api", "repos/o/n/issues/1/comments").stdout)[0]["body"], "edited")
        self.gh("pr", "edit", "1", "--repo", "o/n", "--body", "B2")
        self.assertEqual(self.st()["repos"]["o/n"]["pulls"][0]["body"], "B2")

    def test_body_file_and_input(self):
        (self.tmp / "b.md").write_text("from file", encoding="utf-8")
        self.gh("pr", "create", "--repo", "o/n", "--head", "f", "--base", "main", "--title", "T", "--body-file", str(self.tmp / "b.md"))
        self.assertEqual(self.st()["repos"]["o/n"]["pulls"][0]["body"], "from file")
        self.gh("pr", "comment", "1", "--repo", "o/n", "--body", "c")
        (self.tmp / "in.json").write_text('{"body": "via input"}', encoding="utf-8")
        cid = self.st()["repos"]["o/n"]["comments"]["1"][0]["id"]
        self.gh("api", "-X", "PATCH", f"repos/o/n/issues/comments/{cid}", "--input", str(self.tmp / "in.json"))
        self.assertEqual(self.st()["repos"]["o/n"]["comments"]["1"][0]["body"], "via input")

    def test_merged_pull_views_as_merged(self):
        st = self.st()
        st["repos"] = {"o/n": {"pulls": [self.pull(7, "m", state="closed", merged="2026-01-01T00:00:00Z")]}}
        self.seed(st)
        v = json.loads(self.gh("pr", "view", "7", "--repo", "o/n", "--json", "state").stdout)
        self.assertEqual(v["state"], "MERGED")

    def test_duplicate_open_pr_is_rejected(self):
        args = ("pr", "create", "--repo", "o/n", "--head", "f", "--base", "main", "--title", "T", "--body", "B")
        self.gh(*args)
        self.assertNotEqual(self.gh(*args, check=False).returncode, 0)

    def test_gh_repo_env_and_repo_view(self):
        self.gh("pr", "create", "--head", "f", "--base", "main", "--title", "T", "--body", "B", env={"GH_REPO": "o/n"})
        self.assertEqual(len(self.st()["repos"]["o/n"]["pulls"]), 1)
        out = self.gh("repo", "view", "o/n", "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name").stdout.strip()
        self.assertEqual(out, "main")


class Auth(FakeGhCase):
    def test_token_and_user(self):
        self.assertEqual(self.gh("auth", "token", "--hostname", "github.com", "--user", "sh1ny").stdout.strip(), "tok-s")
        self.assertNotEqual(self.gh("auth", "token", "--user", "nobody", check=False).returncode, 0)
        self.assertEqual(self.gh("api", "user", "--jq", ".login").stdout.strip(), "KintsugiBot")
        self.assertEqual(self.gh("api", "--hostname", "github.com", "user", "--jq", ".login", env={"GH_TOKEN": "tok-s"}).stdout.strip(), "sh1ny")
        self.assertNotEqual(self.gh("api", "user", env={"GH_TOKEN": "bogus"}, check=False).returncode, 0)


class LogAndFailures(FakeGhCase):
    def test_log_lines(self):
        self.gh("auth", "token", "--user", "sh1ny")
        self.gh("api", "user", env={"GH_REPO": "o/n"})
        lines = [json.loads(l) for l in self.logf.read_text(encoding="utf-8").splitlines()]
        self.assertEqual([l["argv"] for l in lines], [["auth", "token", "--user", "sh1ny"], ["api", "user"]])
        self.assertEqual([l["gh_repo"] for l in lines], [None, "o/n"])
        self.assertEqual(Path(lines[0]["cwd"]).resolve(), self.tmp.resolve())

    def test_failure_injection(self):
        st = self.st()
        st["fail"] = [{"match": r"api repos/o/n/pulls", "exit": 4, "stderr": "boom"}]
        self.seed(st)
        r = self.gh("api", "repos/o/n/pulls?head=o:x", check=False)
        self.assertEqual((r.returncode, r.stderr.strip()), (4, "boom"))
        self.assertEqual(self.gh("api", "user").returncode, 0)
        self.assertEqual(len(self.logf.read_text(encoding="utf-8").splitlines()), 2)  # failed calls are logged too

    def test_unknown_command_exits_2(self):
        r = self.gh("release", "list", check=False)
        self.assertEqual(r.returncode, 2)
        self.assertIn("unsupported", r.stderr)


class ReactionsAndGraphql(FakeGhCase):
    GQL_REACTIONS = ("query($id: ID!, $cursor: String) { node(id: $id) { ... on Reactable { "
                     "reactions(first: 100, content: %s, after: $cursor) { nodes { user { login } } "
                     "pageInfo { hasNextPage endCursor } } } } }")
    GQL_PR = ("query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { "
              "defaultBranchRef { name } pullRequest(number: $number) { body baseRefName "
              "closingIssuesReferences(first: 100) { nodes { number repository { nameWithOwner } } "
              "pageInfo { hasNextPage } } } } }")

    def seeded(self):
        st = self.st()
        st["repos"] = {"o/n": {"pulls": [self.pull(7, "b7")]}}
        return st

    def paginated(self, out):
        dec, i, pages = json.JSONDecoder(), 0, []
        while i < len(out):
            obj, j = dec.raw_decode(out, i)
            pages.append(obj)
            i = j
            while i < len(out) and out[i].isspace():
                i += 1
        return pages

    def test_rest_review_comment_reactions_filter_and_paginate(self):
        st = self.seeded()
        for i in range(35):
            fake_gh.add_review_comment_reaction(st, "o/n", 55, f"u{i}", "+1")
        fake_gh.add_review_comment_reaction(st, "o/n", 55, "down", "-1")
        fake_gh.add_review_comment_reaction(st, "o/n", 56, "other", "+1")
        self.seed(st)
        first = json.loads(self.gh("api", "repos/o/n/pulls/comments/55/reactions").stdout)
        self.assertEqual(len(first), 30)
        self.assertEqual(first[0], {"user": {"login": "u0"}, "content": "+1"})
        pages = self.paginated(self.gh("api", "--paginate", "repos/o/n/pulls/comments/55/reactions").stdout)
        self.assertEqual([len(p) for p in pages], [30, 6])
        down = json.loads(self.gh("api", "repos/o/n/pulls/comments/55/reactions?content=-1").stdout)
        self.assertEqual([r["user"]["login"] for r in down], ["down"])
        self.assertEqual(self.gh("api", "repos/o/n/pulls/comments/99/reactions").stdout.strip(), "[]")

    def test_graphql_node_reactions_paged(self):
        st = self.seeded()
        st["graphql_page_size"] = 2
        for login in ("a", "b", "c"):
            fake_gh.add_node_reaction(st, "NODE1", login, "THUMBS_UP")
        fake_gh.add_node_reaction(st, "NODE1", "d", "THUMBS_DOWN")
        self.seed(st)
        r1 = json.loads(self.gh("api", "graphql", "-f", "query=" + self.GQL_REACTIONS % "THUMBS_UP", "-f", "id=NODE1").stdout)
        rx = r1["data"]["node"]["reactions"]
        self.assertEqual([n["user"]["login"] for n in rx["nodes"]], ["a", "b"])
        self.assertTrue(rx["pageInfo"]["hasNextPage"])
        r2 = json.loads(self.gh("api", "graphql", "-f", "query=" + self.GQL_REACTIONS % "THUMBS_UP", "-f", "id=NODE1",
                                "-f", "cursor=" + rx["pageInfo"]["endCursor"]).stdout)
        rx2 = r2["data"]["node"]["reactions"]
        self.assertEqual([n["user"]["login"] for n in rx2["nodes"]], ["c"])
        self.assertEqual(rx2["pageInfo"], {"hasNextPage": False, "endCursor": None})
        down = json.loads(self.gh("api", "graphql", "-f", "query=" + self.GQL_REACTIONS % "THUMBS_DOWN", "-f", "id=NODE1").stdout)
        self.assertEqual([n["user"]["login"] for n in down["data"]["node"]["reactions"]["nodes"]], ["d"])
        none = json.loads(self.gh("api", "graphql", "-f", "query=" + self.GQL_REACTIONS % "THUMBS_UP", "-f", "id=NOPE").stdout)
        self.assertIsNone(none["data"]["node"])

    def test_graphql_pr_closing_refs_and_default_branch(self):
        st = self.seeded()
        st["repos"]["o/n"]["pulls"][0]["body"] = "Fixes #3"
        fake_gh.set_default_branch(st, "o/n", "trunk")
        fake_gh.set_closing_refs(st, "o/n", 7, [(3, "o/n"), (4, "x/y")], has_next=True)
        self.seed(st)
        args = ("api", "graphql", "-f", "query=" + self.GQL_PR, "-f", "owner=o", "-f", "name=n", "-F", "number=7")
        repo = json.loads(self.gh(*args).stdout)["data"]["repository"]
        self.assertEqual(repo["defaultBranchRef"], {"name": "trunk"})
        pr = repo["pullRequest"]
        self.assertEqual((pr["body"], pr["baseRefName"]), ("Fixes #3", "main"))
        self.assertEqual(pr["closingIssuesReferences"], {
            "nodes": [{"number": 3, "repository": {"nameWithOwner": "o/n"}},
                      {"number": 4, "repository": {"nameWithOwner": "x/y"}}],
            "pageInfo": {"hasNextPage": True}})
        fake_gh.set_closing_refs(st, "o/n", 7, [], has_next=False)
        self.seed(st)
        pr = json.loads(self.gh(*args).stdout)["data"]["repository"]["pullRequest"]
        self.assertEqual(pr["closingIssuesReferences"], {"nodes": [], "pageInfo": {"hasNextPage": False}})

    def test_graphql_repository_applies_the_reader_check(self):
        st = self.seeded()
        st["repos"]["o/n"]["readers"] = ["sh1ny"]  # the default user is KintsugiBot
        self.seed(st)
        args = ("api", "graphql", "-f", "query=" + self.GQL_PR, "-f", "owner=o", "-f", "name=n", "-F", "number=7")
        rest = self.gh("api", "repos/o/n/pulls", check=False)
        self.assertEqual(rest.returncode, 1, "the REST path rejects a login that cannot read the repository")
        r = self.gh(*args, check=False)
        self.assertEqual(r.returncode, 1, f"GraphQL answered a login that cannot read the repository: {r.stdout}")
        self.assertIn("Could not resolve to a Repository", r.stderr)
        st["user"] = "sh1ny"
        self.seed(st)
        self.assertEqual(self.gh(*args).returncode, 0)

    def test_graphql_reports_has_next_page_when_more_than_100_refs_are_seeded(self):
        st = self.seeded()
        fake_gh.set_closing_refs(st, "o/n", 7, [(n, "o/n") for n in range(1, 102)], has_next=False)  # no explicit flag
        self.seed(st)
        args = ("api", "graphql", "-f", "query=" + self.GQL_PR, "-f", "owner=o", "-f", "name=n", "-F", "number=7")
        refs = json.loads(self.gh(*args).stdout)["data"]["repository"]["pullRequest"]["closingIssuesReferences"]
        self.assertEqual(len(refs["nodes"]), 100)
        self.assertTrue(refs["pageInfo"]["hasNextPage"])
        fake_gh.set_closing_refs(st, "o/n", 7, [(n, "o/n") for n in range(1, 101)], has_next=False)
        self.seed(st)
        refs = json.loads(self.gh(*args).stdout)["data"]["repository"]["pullRequest"]["closingIssuesReferences"]
        self.assertEqual((len(refs["nodes"]), refs["pageInfo"]["hasNextPage"]), (100, False))

    def test_graphql_unknown_query_exits_2(self):
        r = self.gh("api", "graphql", "-f", "query={ viewer { login } }", check=False)
        self.assertEqual(r.returncode, 2)
        self.assertIn("unsupported", r.stderr)

    def test_failure_injection_on_new_endpoints(self):
        st = self.seeded()
        fake_gh.add_review_comment_reaction(st, "o/n", 55, "u", "+1")
        st["fail"] = [{"match": r"reactions$|pulls/comments/55/reactions", "exit": 3, "stderr": "rest boom"},
                      {"match": r"graphql", "exit": 5, "stderr": "gql boom"}]
        self.seed(st)
        r = self.gh("api", "repos/o/n/pulls/comments/55/reactions", check=False)
        self.assertEqual((r.returncode, r.stderr.strip()), (3, "rest boom"))
        for q in (self.GQL_REACTIONS % "THUMBS_UP", self.GQL_PR):
            r = self.gh("api", "graphql", "-f", "query=" + q, "-f", "id=N", check=False)
            self.assertEqual((r.returncode, r.stderr.strip()), (5, "gql boom"))


@unittest.skipUnless(shutil.which("sh"), "needs sh")
class Shim(FakeGhCase):
    def test_install_fake_gh_shim(self):
        dest = self.tmp / "fx"
        (dest / "bin").mkdir(parents=True)
        fixtures.install_fake_gh(dest)
        env = (dest / "eval.env").read_text(encoding="utf-8")
        self.assertIn(f'export FAKE_GH_STATE="{fixtures.posix(dest / "gh-state.json")}"', env)
        self.assertIn(f'export FAKE_GH_LOG="{fixtures.posix(dest / "gh-log.jsonl")}"', env)
        (dest / "gh-state.json").write_text('{"user": "u"}', encoding="utf-8")
        r = subprocess.run(["sh", str(dest / "bin" / "gh"), "api", "user", "--jq", ".login"], capture_output=True, text=True,
                           env={**os.environ, "FAKE_GH_STATE": str(dest / "gh-state.json"), "FAKE_GH_LOG": str(dest / "gh-log.jsonl")})
        self.assertEqual((r.returncode, r.stdout.strip()), (0, "u"), r.stderr)
        self.assertTrue((dest / "gh-log.jsonl").exists())


if __name__ == "__main__":
    unittest.main()
