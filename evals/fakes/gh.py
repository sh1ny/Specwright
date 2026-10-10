"""A fake `gh` for evals and script tests. Pure stdlib; no network.

State is JSON at $FAKE_GH_STATE:
  {"user": "login",                      # who `api user` reports without GH_TOKEN
   "tokens": {"login": "token"},         # `auth token --user`; GH_TOKEN picks the user
   "repos": {"owner/name": {"pulls": [REST pull objects], "comments": {"<pr>": [...]},
                            "default_branch": "main"}},
   "fail": ["regex" | {"match": "regex", "exit": 1, "stderr": "msg"}]}
Any call whose argv (joined by spaces) matches a `fail` pattern exits non-zero.
Every call appends one JSON line {argv, cwd, gh_repo} to $FAKE_GH_LOG.

Optional per-repo "readers": [logins] - only they may call `api repos/<o>/<n>/...` (a private repo); others get 404.
Optional per-repo "activity": [{"ref": "refs/heads/b", "after": "<sha>", "timestamp": "..."}]
backs `api repos/<o>/<n>/activity?ref=...` (the push-time lookup).
Covers: auth token (and its --help, which names --user), api (user, pulls list/get, activity,
issue comments list/create/patch), pr create/view/comment/edit, repo view. Anything else exits 2.
Like real gh, `api --paginate` prints each page's JSON one after another.

Reactions and closing references (state keys; add them with the helpers add_review_comment_reaction,
add_node_reaction, set_closing_refs, set_default_branch, which take and mutate the state dict):
  repos[slug]["review_comment_reactions"] = {"<comment id>": [{"user": {"login": l}, "content": "+1" | "-1"}]}
  st["nodes"] = {"<node id>": {"reactions": [{"login": l, "content": "THUMBS_UP" | "THUMBS_DOWN"}]}}
  pull["closing_refs"] = [{"number": n, "repo": "owner/name"}]; pull["closing_refs_has_next"] = bool
  st["graphql_page_size"] = N  (optional; caps the reactions page size below the query's `first`)

Accepted calls (anything else under `api graphql` exits 2):
  REST  `api [--paginate] repos/<o>/<n>/pulls/comments/<id>/reactions[?content=%2B1|-1&per_page=N]`
        -> JSON array of {user:{login}, content}; pages of 30 (per_page up to 100), like the other REST lists.
  GQL a `api graphql -f query='...' -f id=<node id> [-f cursor=<endCursor>]` where the query text contains
        `node(id: $id)` and `reactions(` with `content: THUMBS_UP` or `content: THUMBS_DOWN` and `after: $cursor`:
        { node(id: $id) { ... on Reactable { reactions(first: 100, content: THUMBS_UP, after: $cursor)
          { nodes { user { login } } pageInfo { hasNextPage endCursor } } } } }
        -> {"data":{"node":{"reactions":{"nodes":[{"user":{"login":l}}],"pageInfo":{...}}}}}; node null if unknown.
  GQL b `api graphql -f query='...' -f owner=<o> -f name=<n> -F number=<pr>`; the query text contains
        `repository(` and `pullRequest(number`:
        { repository(owner: $owner, name: $name) { defaultBranchRef { name }
          pullRequest(number: $number) { body baseRefName closingIssuesReferences(first: 100)
            { nodes { number repository { nameWithOwner } } pageInfo { hasNextPage } } } } }
        -> {"data":{"repository":{"defaultBranchRef":{"name":b},"pullRequest":{...}}}}
Fields not named in the query are still returned; the failure-injection `fail` patterns match the whole argv,
so e.g. "graphql" or "/reactions" apply.
"""
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from urllib.parse import parse_qsl, urlsplit

HOST = "https://github.com"


class Fail(Exception):
    def __init__(self, msg, code=1):
        super().__init__(msg)
        self.code = code


def load():
    p = os.environ.get("FAKE_GH_STATE")
    if p and os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save(st):
    p = os.environ.get("FAKE_GH_STATE")
    if p:
        with open(p, "w", encoding="utf-8", newline="\n") as f:
            json.dump(st, f, indent=2)


def log(argv):
    p = os.environ.get("FAKE_GH_LOG")
    if p:
        with open(p, "a", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps({"argv": argv, "cwd": os.getcwd(), "gh_repo": os.environ.get("GH_REPO")}) + "\n")


def inject_failure(st, argv):
    line = " ".join(argv)
    for f in st.get("fail", []):
        f = {"match": f} if isinstance(f, str) else f
        if re.search(f["match"], line):
            raise Fail(f.get("stderr", "fake gh: injected failure"), f.get("exit", 1))


def parse(args, valued, flags=()):
    """Split args into ({flag: [values]}, positionals). Short and long names share one key."""
    opts, pos, i = {}, [], 0
    while i < len(args):
        a = args[i]
        if a.startswith("-") and a != "-":
            k, eq, v = a.partition("=")
            if k in valued:
                if not eq:
                    i += 1
                    if i >= len(args):
                        raise Fail(f"flag needs an argument: {k}", 2)
                    v = args[i]
                opts.setdefault(valued[k], []).append(v)
            elif k in flags:
                opts[k.lstrip("-")] = [True]
            else:
                raise Fail(f"unknown flag: {k}", 2)
        else:
            pos.append(a)
        i += 1
    return opts, pos


def one(opts, key, default=None):
    return opts[key][-1] if key in opts else default


def body_of(opts):
    if "body-file" in opts:
        f = one(opts, "body-file")
        return sys.stdin.read() if f == "-" else open(f, encoding="utf-8").read()
    return one(opts, "body")


def jq(data, expr):
    """Simple paths (`.a.b`, `.[]`, `.[].a`, `.a[]`) here; anything else (select, pipes, functions) goes to the real
    `jq -r -c`, as gh's own --jq would evaluate it. Strings print raw."""
    if not re.fullmatch(r"(\.(\[\]|[A-Za-z_][\w-]*))+|\.", expr.strip()):
        r = subprocess.run(["jq", "-r", "-c", expr], input=json.dumps(data), capture_output=True, text=True, encoding="utf-8")
        if r.returncode:
            raise Fail(f"fake gh: jq failed: {r.stderr.strip()}", 1)
        return r.stdout.rstrip("\n")
    cur = [data]
    for part in re.findall(r"\.?([^.\[\]]+|\[\])", expr.strip()):
        nxt = []
        for c in cur:
            if part == "[]":
                nxt.extend(c if isinstance(c, list) else [])
            elif isinstance(c, dict):
                nxt.append(c.get(part))
        cur = nxt
    return "\n".join(c if isinstance(c, str) else json.dumps(c) for c in cur)


def emit(data, expr=None):
    print(jq(data, expr) if expr else json.dumps(data))


def repo_of(opts, st):
    r = one(opts, "repo") or os.environ.get("GH_REPO")
    if not r:
        out = subprocess.run(["git", "remote", "get-url", "origin"], capture_output=True, text=True)
        m = re.search(r"github\.com[:/]([^/]+/[^/]+?)(?:\.git)?$", out.stdout.strip())
        r = m.group(1) if m else None
    if not r:
        raise Fail("no repository: pass --repo or set GH_REPO")
    r = r.split("github.com/")[-1].strip("/")
    return r, st.setdefault("repos", {}).setdefault(r, {})


def pull_url(slug, n):
    return f"{HOST}/{slug}/pull/{n}"


def find_pull(slug, repo, ref):
    ref = str(ref)
    m = re.search(r"/pull/(\d+)", ref)
    n = int(m.group(1)) if m else int(ref) if ref.isdigit() else None
    for p in repo.get("pulls", []):
        if (n is not None and p["number"] == n) or (n is None and p["head"]["ref"] == ref):
            return p
    raise Fail(f"GraphQL: Could not resolve to a PullRequest with the number of {ref}. (repository.pullRequest)")


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def new_comment(st, slug, num, text, user):
    st["next_id"] = st.get("next_id", 1000) + 1
    c = {"id": st["next_id"], "body": text, "user": {"login": user}, "created_at": now(),
         "html_url": f"{pull_url(slug, num)}#issuecomment-{st['next_id']}"}
    st["repos"][slug].setdefault("comments", {}).setdefault(str(num), []).append(c)
    return c


def whoami(st):
    tok = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if tok:
        for login, t in st.get("tokens", {}).items():
            if t == tok:
                return login
        raise Fail("gh: Bad credentials (HTTP 401)")
    if not st.get("user"):
        raise Fail("gh: To get started with GitHub CLI, please run:  gh auth login")
    return st["user"]


def graphql_view(p, slug):
    state = "MERGED" if p.get("merged_at") else p["state"].upper()
    return {"number": p["number"], "url": p["html_url"], "state": state, "title": p.get("title", ""),
            "body": p.get("body") or "", "headRefName": p["head"]["ref"], "baseRefName": p["base"]["ref"],
            "headRepositoryOwner": {"login": p["head"]["repo"]["full_name"].split("/")[0]},
            "isCrossRepository": p["head"]["repo"]["full_name"] != slug}


def cmd_auth(st, args):
    if args[:1] != ["token"]:
        raise Fail(f"fake gh: unsupported auth command {args[:1]}", 2)
    if "--help" in args or "-h" in args[1:]:
        print("Print the authentication token gh uses for a hostname and account.\n\nFLAGS\n"
              "  -h, --hostname string   The hostname of the GitHub instance\n"
              "  -u, --user string       The account to log out of")
        return
    o, _ = parse(args[1:], {"--hostname": "hostname", "-h": "hostname", "--user": "user", "-u": "user"})
    login = one(o, "user") or st.get("user")
    tok = st.get("tokens", {}).get(login)
    if not tok:
        raise Fail(f"no oauth token found for {login}")
    print(tok)


def paged(items, query):
    n = max(1, min(int(query.get("per_page", 30)), 100))
    page = int(query.get("page", 1))
    return items[(page - 1) * n: page * n], len(items) > page * n


def emit_pages(items, query, o, expr):
    """First page only, or every page with --paginate."""
    query["page"] = int(query.get("page", 1))
    while True:
        page, more = paged(items, query)
        emit(page, expr)
        if not more or "paginate" not in o:
            return
        query["page"] += 1


def add_review_comment_reaction(st, slug, comment_id, login, content):
    """content is the REST form: "+1" or "-1"."""
    rx = st.setdefault("repos", {}).setdefault(slug, {}).setdefault("review_comment_reactions", {})
    rx.setdefault(str(comment_id), []).append({"user": {"login": login}, "content": content})


def add_node_reaction(st, node_id, login, content):
    """content is the GraphQL form: "THUMBS_UP" or "THUMBS_DOWN"."""
    st.setdefault("nodes", {}).setdefault(str(node_id), {}).setdefault("reactions", []).append(
        {"login": login, "content": content})


def set_closing_refs(st, slug, number, refs, has_next=False):
    """refs: [(number, "owner/name"), ...] for PR `number` of `slug`."""
    for p in st["repos"][slug]["pulls"]:
        if p["number"] == number:
            p["closing_refs"] = [{"number": n, "repo": r} for n, r in refs]
            p["closing_refs_has_next"] = has_next
            return
    raise KeyError(number)


def set_default_branch(st, slug, name):
    st.setdefault("repos", {}).setdefault(slug, {})["default_branch"] = name


def cmd_graphql(st, fields):
    q = fields.get("query", "")
    if "node(id" in q and "reactions(" in q:
        m = re.search(r"content:\s*(THUMBS_UP|THUMBS_DOWN)", q)
        content = m.group(1) if m else fields.get("content")
        first = re.search(r"first:\s*(\d+)", q)
        size = max(1, min(int(first.group(1)) if first else 30, 100, int(st.get("graphql_page_size", 100))))
        node = st.get("nodes", {}).get(fields.get("id", ""))
        if node is None:
            return {"data": {"node": None}}
        items = [r for r in node.get("reactions", []) if not content or r["content"] == content]
        start = int(fields.get("cursor") or 0)
        end = start + size
        return {"data": {"node": {"reactions": {
            "nodes": [{"user": {"login": r["login"]}} for r in items[start:end]],
            "pageInfo": {"hasNextPage": end < len(items), "endCursor": str(end) if end < len(items) else None}}}}}
    if "repository(" in q and "pullRequest(number" in q:
        slug = f"{fields.get('owner')}/{fields.get('name')}"
        repo = st.get("repos", {}).get(slug)
        if repo is None:
            raise Fail(f"GraphQL: Could not resolve to a Repository with the name '{slug}'. (repository)")
        if repo.get("readers") and whoami(st) not in repo["readers"]:  # the same access check as the REST path
            raise Fail(f"GraphQL: Could not resolve to a Repository with the name '{slug}'. (repository)")
        p = find_pull(slug, repo, fields.get("number", ""))
        refs = p.get("closing_refs", [])
        return {"data": {"repository": {"defaultBranchRef": {"name": repo.get("default_branch", "main")},
                "pullRequest": {"body": p.get("body") or "", "baseRefName": p["base"]["ref"],
                                "closingIssuesReferences": {
                                    "nodes": [{"number": r["number"], "repository": {"nameWithOwner": r.get("repo", slug)}}
                                              for r in refs[:100]],
                                    "pageInfo": {"hasNextPage": bool(p.get("closing_refs_has_next")) or len(refs) > 100}}}}}}
    raise Fail("fake gh: unsupported graphql query", 2)


def cmd_api(st, args):
    o, pos = parse(args, {"-X": "method", "--method": "method", "-f": "field", "--raw-field": "field",
                          "-F": "field", "--field": "field", "--input": "input", "--jq": "jq", "-q": "jq",
                          "--hostname": "hostname", "-H": "header", "--header": "header", "-t": "tmpl",
                          "--template": "tmpl", "--cache": "cache"}, ("--paginate", "--silent", "--include", "--slurp"))
    if len(pos) != 1:
        raise Fail("fake gh: api needs exactly one endpoint", 2)
    u = urlsplit(pos[0].lstrip("/"))
    query = dict(parse_qsl(u.query))
    path, method = u.path, (one(o, "method") or "GET").upper()
    fields = dict(f.partition("=")[::2] for f in o.get("field", []))
    if "input" in o:
        i = one(o, "input")
        fields.update(json.loads(sys.stdin.read() if i == "-" else open(i, encoding="utf-8").read()))
    if method == "GET":
        query.update(fields)
    expr = one(o, "jq")
    if path == "user":
        return emit({"login": whoami(st)}, expr)
    if path == "graphql":
        return emit(cmd_graphql(st, fields), expr)
    m = re.fullmatch(r"repos/([^/]+/[^/]+)/(.*)", path)
    if not m:
        raise Fail(f"fake gh: unsupported api endpoint {path}", 2)
    slug, rest = m.groups()
    repo = st.setdefault("repos", {}).setdefault(slug, {})
    if repo.get("readers") and whoami(st) not in repo["readers"]:
        raise Fail("gh: Not Found (HTTP 404)")
    if rest == "pulls" and method == "GET":
        state = query.get("state", "open")
        head = query.get("head")
        items = [p for p in sorted(repo.get("pulls", []), key=lambda p: -p["number"])
                 if (state == "all" or p["state"] == state)
                 and (not head or p["head"]["label"] == head)
                 and (not query.get("base") or p["base"]["ref"] == query["base"])]
        return emit_pages(items, query, o, expr)
    if rest == "activity" and method == "GET":
        items = [a for a in repo.get("activity", []) if not query.get("ref") or a.get("ref") == query["ref"]]
        return emit_pages(items, query, o, expr)
    m = re.fullmatch(r"pulls/(\d+)", rest)
    if m and method == "GET":
        return emit(find_pull(slug, repo, m.group(1)), expr)
    m = re.fullmatch(r"pulls/comments/(\d+)/reactions", rest)
    if m and method == "GET":
        items = [r for r in repo.get("review_comment_reactions", {}).get(m.group(1), [])
                 if not query.get("content") or r["content"] == query["content"].replace(" ", "+")]
        return emit_pages(items, query, o, expr)
    m = re.fullmatch(r"issues/(\d+)/comments", rest)
    if m:
        num = m.group(1)
        if method == "POST":
            return emit(new_comment(st, slug, num, fields.get("body", ""), whoami(st)), expr)
        if method == "GET":
            return emit_pages(repo.get("comments", {}).get(num, []), query, o, expr)
    m = re.fullmatch(r"issues/comments/(\d+)", rest)
    if m and method == "PATCH":
        for lst in repo.get("comments", {}).values():
            for c in lst:
                if c["id"] == int(m.group(1)):
                    c["body"] = fields.get("body", c["body"])
                    return emit(c, expr)
        raise Fail("gh: Not Found (HTTP 404)")
    raise Fail(f"fake gh: unsupported api call {method} {path}", 2)


def cmd_pr(st, args):
    sub, args = (args[:1] or [""])[0], args[1:]
    V = {"--repo": "repo", "-R": "repo", "--body": "body", "-b": "body", "--body-file": "body-file", "-F": "body-file",
         "--title": "title", "-t": "title", "--base": "base", "-B": "base", "--head": "head", "-H": "head",
         "--json": "json", "--jq": "jq", "-q": "jq"}
    o, pos = parse(args, V, ("--draft", "-d", "--web", "--edit-last"))
    slug, repo = repo_of(o, st)
    if sub == "create":
        head = one(o, "head")
        if not head:
            raise Fail("fake gh: pr create needs --head", 2)
        owner, _, ref = head.rpartition(":")
        owner = owner or slug.split("/")[0]
        pulls = repo.setdefault("pulls", [])
        if any(p["state"] == "open" and p["head"]["ref"] == ref and p["head"]["repo"]["full_name"].split("/")[0] == owner
               for p in pulls):
            raise Fail(f'a pull request for branch "{ref}" into branch "{one(o, "base", "main")}" already exists')
        n = max([p["number"] for p in pulls] + [0]) + 1
        pulls.append({"number": n, "html_url": pull_url(slug, n), "state": "open", "merged_at": None,
                      "title": one(o, "title", ""), "body": body_of(o) or "",
                      "head": {"ref": ref, "label": f"{owner}:{ref}", "sha": f"{n:040x}",
                               "repo": {"full_name": f"{owner}/{slug.split('/')[1]}"}},
                      "base": {"ref": one(o, "base") or repo.get("default_branch", "main")}})
        return print(pull_url(slug, n))
    if sub == "view":
        p = find_pull(slug, repo, pos[0] if pos else "")
        if "json" in o:
            v = graphql_view(p, slug)
            return emit({k: v[k] for k in one(o, "json").split(",") if k in v}, one(o, "jq"))
        return print(f"title:\t{p['title']}\nstate:\t{graphql_view(p, slug)['state']}\nurl:\t{p['html_url']}\n--\n{p['body']}")
    if sub == "comment":
        p = find_pull(slug, repo, pos[0] if pos else "")
        return print(new_comment(st, slug, p["number"], body_of(o) or "", whoami(st))["html_url"])
    if sub == "edit":
        p = find_pull(slug, repo, pos[0] if pos else "")
        if body_of(o) is not None:
            p["body"] = body_of(o)
        if "title" in o:
            p["title"] = one(o, "title")
        if "base" in o:
            p["base"]["ref"] = one(o, "base")
        return print(p["html_url"])
    raise Fail(f"fake gh: unsupported pr command {sub!r}", 2)


def cmd_repo(st, args):
    if args[:1] != ["view"]:
        raise Fail(f"fake gh: unsupported repo command {args[:1]}", 2)
    o, pos = parse(args[1:], {"--json": "json", "--jq": "jq", "-q": "jq"})
    slug = (pos[0] if pos else None) or os.environ.get("GH_REPO") or repo_of({}, st)[0]
    repo = st.setdefault("repos", {}).setdefault(slug, {})
    full = {"nameWithOwner": slug, "name": slug.split("/")[1], "owner": {"login": slug.split("/")[0]},
            "url": f"{HOST}/{slug}", "defaultBranchRef": {"name": repo.get("default_branch", "main")}}
    if "json" in o:
        return emit({k: full[k] for k in one(o, "json").split(",") if k in full}, one(o, "jq"))
    print(f"name:\t{slug}\nurl:\t{full['url']}")


def main(argv):
    log(argv)
    st = load()
    try:
        inject_failure(st, argv)
        cmds = {"auth": cmd_auth, "api": cmd_api, "pr": cmd_pr, "repo": cmd_repo}
        if not argv or argv[0] not in cmds:
            raise Fail(f"fake gh: unsupported command: {' '.join(argv)}", 2)
        cmds[argv[0]](st, argv[1:])
    except Fail as e:
        print(str(e), file=sys.stderr)
        return e.code
    save(st)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
