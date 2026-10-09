#!/usr/bin/env bash
# Decisions for a change that lives in two repos (code + planning store): which
# PRs are expected, how they link, what watch does, and how an interrupted
# feedback pass resumes. Every subcommand prints ONE JSON line.
#
# Usage: bash pr-pair.sh <subcommand> [options]
#   identity <dir>                    fetch URL + every push URL of origin -> owner/name
#   context --code <dir> [--store <dir>]
#                                     per-repo login, main, validate, reviewers (specwright.yaml + planning_store:)
#   discover --repo o/n --branch b [--base main] [--state all|open|closed|merged[,..]]
#                                     every PR from o/n's own branch b, paginated; failure = unknown (exit 3)
#   expected --code <dir> --store <dir> --branch b
#                                     the expected PR set: store (GitHub origin) and code (PR in any state, or commits)
#   ensure-pr --repo o/n --branch b --base main --title t --body-file f
#                                     find the open PR or create it; stops on a wrong base; never edits a description
#   link --repo o/n --pr N --kind store|code --peer-url URL [--login L]
#                                     one marker comment <!-- specwright:link KIND URL -->; edits its own on a new peer
#   pair-state --code d --store d --branch b [--snapshot code=f] [--snapshot store=f] [--dropped id@rev]...
#                                     watch action: ship | wait | ready | split_hand_off | cleanup | no_watch
#   rounds --code d --store d --branch b
#                                     highest Feedback-Round across both branches (+ legacy subject count, unpushed)
#   pass write --code d --store d --code-repo o/n --change c --intent file [--store-prefix openspec]
#   pass plan|done --code d --store d --code-repo o/n --change c --snapshot code=f --snapshot store=f
#                                     the intent record of a feedback pass; the evidence-based resume plan; delete
#   cleanup-plan --code d --store d --branch b
#                                     post-merge commands per repo whose expected PR is MERGED
# Exit: 0 answered, 1 stop (the JSON has "error" and "message"; an unexpected failure is
#       error "internal_error"), 2 usage or missing input,
#       3 GitHub state unknown (a lookup failed; never read it as "no PR").
# Every gh call names its repository (--repo or repos/<o>/<n>/...) and runs with GH_REPO unset, so an
# inherited override cannot redirect a store lookup to the code repo. Wrap with as.sh to pin the
# GitHub identity, started inside the repository it acts on (its header scrub is per working directory).
# Needs bash, git, gh 2.40+ and Python 3.8+.
set -euo pipefail

py=
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(sys.version_info < (3, 8))' >/dev/null 2>&1; then py=$c; break; fi
done
[ -n "$py" ] || { echo '{"ok":false,"error":"no_python","message":"pr-pair.sh needs python 3.8+"}'; exit 2; }
unset GH_REPO
# native Windows python cannot run an MSYS path; hand it a Windows path to this bash for its gh calls
PR_PAIR_BASH=${BASH:-}
if [ -n "$PR_PAIR_BASH" ] && command -v cygpath >/dev/null 2>&1; then PR_PAIR_BASH=$(cygpath -w "$PR_PAIR_BASH"); fi
export PR_PAIR_BASH

exec "$py" -I -X utf8 - "$@" <<'PYSRC'
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ENV = {k: v for k, v in os.environ.items() if k != "GH_REPO"}
BASH = os.environ.get("PR_PAIR_BASH") or shutil.which("bash")
TRAILER = re.compile(r"^Feedback-Round:[ \t]*(\d+)[ \t]*$", re.M)
LEGACY_SUBJECT = re.compile(r"address review feedback", re.I)
MARK = re.compile(r"<!--\s*specwright:link\s+(store|code)\s+(\S+)\s*-->")
GH_URL = re.compile(
    r"^(?:(?:https?|ssh|git)://(?:[^@/\s]+@)?(?:ssh\.)?github\.com(?::\d+)?/|(?:[^@/\s]+@)?(?:ssh\.)?github\.com:)"
    r"([^/\s]+)/([^/\s]+?)(?:\.git)?/?$", re.I)


class Stop(Exception):
    def __init__(self, error, message="", code=1, **extra):
        super().__init__(message or error)
        self.error, self.message, self.code, self.extra = error, message or error, code, extra

    def obj(self):
        return {"ok": False, "error": self.error, "message": self.message, **self.extra}


def usage(msg):
    raise Stop("usage", msg, code=2)


def emit(obj, code=0):
    # U+2028/U+2029 stay escaped: line splitters treat them as line ends, and every subcommand prints ONE JSON line
    print(json.dumps(obj, ensure_ascii=False).replace("\u2028", "\\u2028").replace("\u2029", "\\u2029"))
    sys.exit(code)


def run(cmd, cwd=None):
    try:
        return subprocess.run(cmd, cwd=cwd, env=ENV, capture_output=True, text=True, encoding="utf-8", errors="replace")
    except OSError as e:
        return subprocess.CompletedProcess(cmd, 127, "", str(e))


def git(d, *args):
    return run(["git", *args], cwd=d)


REPO_LOGIN, TOKENS = {}, {}  # repo slug (lower) -> login that reads it; login -> its verified token


def gh(*args):
    # through bash so a `gh` that is a shell script (or a shim) resolves like it does for the caller
    cmd = [BASH, "-c", 'exec gh "$@"', "gh", *args] if BASH else ["gh", *args]
    login = REPO_LOGIN.get((repo_of(args) or "").lower())
    if not login:
        return run(cmd)
    try:
        return subprocess.run(cmd, env={**ENV, "GH_TOKEN": token_for(login)}, capture_output=True, text=True,
                              encoding="utf-8", errors="replace")
    except OSError as e:
        return subprocess.CompletedProcess(cmd, 127, "", str(e))


def repo_of(args):
    for i, x in enumerate(args):
        m = re.match(r"/?repos/([^/]+/[^/?]+)", x)
        if m:
            return m.group(1)
        if x == "--repo" and i + 1 < len(args):
            return args[i + 1]
    return None


def token_for(login):
    """`login`'s gh token, pinned and verified the way as.sh pins one (never `gh auth switch`)."""
    if login not in TOKENS:
        bare = {k: v for k, v in ENV.items() if k not in ("GH_TOKEN", "GITHUB_TOKEN")}
        base = [BASH, "-c", 'exec gh "$@"', "gh"] if BASH else ["gh"]
        r = subprocess.run(base + ["auth", "token", "--hostname", "github.com", "--user", login], env=bare,
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        tok = r.stdout.strip() if r.returncode == 0 else ""
        if not tok:
            raise Stop("no_credential", f"no gh credential for '{login}' (planning_store.login); run gh auth login", code=3, login=login)
        v = subprocess.run(base + ["api", "--hostname", "github.com", "user", "--jq", ".login"], env={**bare, "GH_TOKEN": tok},
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        if v.stdout.strip() != login:
            raise Stop("identity_mismatch", f"the token for '{login}' resolves to '{v.stdout.strip()}'; refusing", code=3, login=login)
        TOKENS[login] = tok
    return TOKENS[login]


def read_store_as(ctx, store_repo):
    """Store reads use planning_store.login when it differs from the code login the pair-wide call runs as."""
    s, c = (ctx.get("store") or {}).get("login") or "", ctx["code"].get("login") or ""
    if store_repo and s and s.lower() != c.lower():
        REPO_LOGIN[store_repo.lower()] = s


def norm(p):
    return str(p).replace("\\", "/")


def parse_args(argv, spec):
    """spec maps a flag to a destination; '+dest' collects repeats."""
    a, pos, i = {}, [], 0
    while i < len(argv):
        t = argv[i]
        if t in spec:
            dest = spec[t]
            if i + 1 >= len(argv):
                usage(f"{t} needs a value")
            v, i = argv[i + 1], i + 2
            if dest.startswith("+"):
                a.setdefault(dest[1:], []).append(v)
            else:
                a[dest] = v
        elif t.startswith("--"):
            usage(f"unknown option {t}")
        else:
            pos.append(t)
            i += 1
    return a, pos


def need(a, *names):
    for n in names:
        if not a.get(n):
            usage(f"missing --{n.replace('_', '-')}")


# ---- a small YAML reader: maps, scalars, flow maps/lists, comments (all specwright.yaml uses) ------------------
def strip_comment(s):
    q, esc = None, False
    for i, ch in enumerate(s):
        if esc:
            esc = False
        elif q:
            if q == '"' and ch == "\\":
                esc = True
            elif ch == q:
                q = None
        elif ch in "\"'":
            q = ch
        elif ch == "#" and (i == 0 or s[i - 1] in " \t"):
            return s[:i]
    return s


def split_top(s, sep=","):
    parts, depth, q, esc, cur = [], 0, None, False, ""
    for ch in s:
        if esc:
            esc = False
        elif q:
            if q == '"' and ch == "\\":
                esc = True
            elif ch == q:
                q = None
        elif ch in "\"'":
            q = ch
        elif ch in "{[":
            depth += 1
        elif ch in "}]":
            depth -= 1
        elif ch == sep and depth == 0:
            parts.append(cur)
            cur = ""
            continue
        cur += ch
    if cur.strip():
        parts.append(cur)
    return parts


def scalar(v):
    v = v.strip()
    if v == "":
        return None
    if v[0] == "{" and v[-1] == "}":
        out = {}
        for part in split_top(v[1:-1]):
            k, _, val = part.partition(":")
            out[unquote(k.strip())] = scalar(val)
        return out
    if v[0] == "[" and v[-1] == "]":
        return [scalar(p) for p in split_top(v[1:-1])]
    if v[0] in "\"'" and v[-1] == v[0] and len(v) >= 2:
        return unquote(v)
    if v.lower() in ("true", "yes"):
        return True
    if v.lower() in ("false", "no"):
        return False
    if v in ("null", "~"):
        return None
    if re.fullmatch(r"-?\d+", v):
        return int(v)
    return v


YAML_ESCAPES = {"0": "\0", "a": "\a", "b": "\b", "t": "\t", "\t": "\t", "n": "\n", "v": "\v", "f": "\f", "r": "\r",
                "e": "\x1b", " ": " ", '"': '"', "/": "/", "\\": "\\", "N": "\x85", "_": "\xa0", "L": "\u2028", "P": "\u2029"}


def unquote(k):
    """Strip a scalar's quotes and decode them as YAML does: `''` in single quotes, backslash escapes in double."""
    if len(k) < 2 or k[0] not in "\"'" or k[-1] != k[0]:
        return k
    body = k[1:-1]
    if k[0] == "'":
        return body.replace("''", "'")

    def esc(m):
        e = m.group(1)
        return chr(int(e[1:], 16)) if len(e) > 1 else YAML_ESCAPES.get(e, m.group(0))
    return re.sub(r"\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|.)", esc, body)


BLOCK_HEADER = re.compile(r"^([|>])([+-]?)\d*$")


def block_scalar(raw, start, indent, style, chomp):
    """Read a `|` or `>` block scalar from raw lines after a key at `indent`; returns (value, next raw index)."""
    end = start
    while end < len(raw) and (not raw[end].strip() or len(raw[end]) - len(raw[end].lstrip(" ")) > indent):
        end += 1
    body = [l.rstrip("\r") for l in raw[start:end]]
    filled = [l for l in body if l.strip()]
    pad = len(filled[0]) - len(filled[0].lstrip(" ")) if filled else 0
    lines = [l[pad:] if l.strip() else "" for l in body]
    trailing = 0
    while lines and lines[-1] == "":
        lines.pop()
        trailing += 1
    if style == "|":
        text = "\n".join(lines)
    else:
        text, prev = "", None
        for l in lines:
            text += "\n" if l == "" else (" " + l if prev else l)
            prev = l != ""
    if not lines or chomp == "-":
        return text, end
    return text + "\n" + ("\n" * trailing if chomp == "+" else ""), end


def parse_yaml(text):
    raw = text.splitlines()
    lines = []
    for n, r in enumerate(raw):
        s = strip_comment(r).rstrip()
        if s.strip():
            lines.append((len(s) - len(s.lstrip(" ")), s.strip(), n))

    def block(i, indent):
        d = {}
        while i < len(lines) and lines[i][0] == indent:
            body = lines[i][1]
            m = re.match(r"^((?:\"(?:[^\"\\]|\\.)*\"|'(?:[^']|'')*'|[^:\s][^:]*?)):(?:\s+(.*))?$", body)
            if not m:
                i += 1
                continue
            key, val = unquote(m.group(1).strip()), m.group(2)
            row = lines[i][2]
            i += 1
            header = BLOCK_HEADER.match(val.strip()) if val else None
            if header:
                d[key], end = block_scalar(raw, row + 1, indent, header.group(1), header.group(2))
                while i < len(lines) and lines[i][2] < end:
                    i += 1
            elif val is None or val.strip() == "":
                if i < len(lines) and lines[i][0] > indent:
                    d[key], i = block(i, lines[i][0])
                else:
                    d[key] = None
            else:
                d[key] = scalar(val)
        return d, i

    return block(0, lines[0][0])[0] if lines else {}


def duration(v, default):
    if v is None or v == "":
        return default
    if isinstance(v, int):
        return v
    m = re.fullmatch(r"(\d+)\s*([smh]?)", str(v).strip())
    if not m:
        return default
    return int(m.group(1)) * {"": 1, "s": 1, "m": 60, "h": 3600}[m.group(2)]


# ---- repositories ----------------------------------------------------------------------------------------------
def parse_repo(url):
    m = GH_URL.match(url.strip())
    return f"{m.group(1)}/{m.group(2)}" if m else None


def identity(d):
    if not d or not Path(d).is_dir() or git(d, "rev-parse", "--git-dir").returncode != 0:
        raise Stop("not-a-repo", f"{d} is not a git work tree")
    r = git(d, "remote", "get-url", "origin")
    if r.returncode != 0:
        raise Stop("no-origin", f"{d} has no origin remote")
    fetch_url = r.stdout.strip()
    push_urls = [u for u in git(d, "remote", "get-url", "--push", "--all", "origin").stdout.split("\n") if u.strip()] or [fetch_url]
    fetch, push = parse_repo(fetch_url), [parse_repo(u) for u in push_urls]
    if fetch is None or any(p is None for p in push):
        raise Stop("not-github", f"origin of {d} is not a GitHub repository: fetch {fetch_url}, push {', '.join(push_urls)}",
                   fetch_url=fetch_url, push_urls=push_urls)
    if any(p.lower() != fetch.lower() for p in push):
        raise Stop("mismatch", f"origin of {d} fetches from {fetch} but pushes to {', '.join(push)}; "
                   "forks and mirrors as push targets are not supported", fetch=fetch, push=push)
    return {"ok": True, "repo": fetch, "owner": fetch.split("/")[0], "name": fetch.split("/")[1], "fetch": fetch, "push": push}


def has_ref(d, ref):
    return git(d, "show-ref", "--verify", "--quiet", ref).returncode == 0


def detect_main(d):
    for name in ("main", "master"):
        if has_ref(d, f"refs/heads/{name}") or has_ref(d, f"refs/remotes/origin/{name}"):
            return name
    return "main"


def main_ref(d, main):
    for ref in (f"refs/heads/{main}", f"refs/remotes/origin/{main}"):
        if has_ref(d, ref):
            return ref
    return None


def toplevel(d):
    r = git(d, "rev-parse", "--show-toplevel")
    return r.stdout.strip() if r.returncode == 0 and r.stdout.strip() else d


# ---- settings --------------------------------------------------------------------------------------------------
def load_settings(code_dir):
    for base in (code_dir, toplevel(code_dir)):
        p = Path(base) / "openspec" / "specwright.yaml"
        if p.is_file():
            return parse_yaml(p.read_text(encoding="utf-8", errors="replace")) or {}
    return {}


def reviewers_of(raw):
    out = {}
    for login, cfg in (raw or {}).items():
        cfg = cfg if isinstance(cfg, dict) else {}
        out[re.sub(r"\[bot\]$", "", str(login))] = {
            "role": str(cfg.get("role") or "required"), "timeout": duration(cfg.get("timeout"), 1200),
            "request": str(cfg.get("request") or "")}
    return out


def repo_ctx(s, d, which):
    g, pr, ps = s.get("github") or {}, s.get("pr") or {}, s.get("planning_store") or {}
    rr = g.get("review_request") or {}
    c = {"dir": norm(d), "review_request": {"body": str(rr.get("body") or ""), "login": str(rr.get("login") or ""),
                                              "after_fixes": bool(rr.get("after_fixes"))},
         "request_as": str(pr.get("request_as") or "")}
    if which == "store":
        c["login"] = str(ps.get("login") or g.get("login") or "")
        c["main"] = str(ps.get("main_branch") or detect_main(d))
        c["validate"] = str(ps.get("validate") or "")
        own = ps.get("reviewers")
        c["reviewers"] = reviewers_of(own if isinstance(own, dict) else pr.get("reviewers"))
        c["requests_disabled"] = isinstance(own, dict) and not own
    else:
        c["login"] = str(g.get("login") or "")
        c["main"] = str(s.get("main_branch") or detect_main(d))
        c["validate"] = str(pr.get("validate") or "")
        c["reviewers"] = reviewers_of(pr.get("reviewers"))
        c["requests_disabled"] = False
    return c


def contexts(code, store):
    s = load_settings(code)
    pr = s.get("pr") or {}
    out = {"code": repo_ctx(s, code, "code"), "store": repo_ctx(s, store, "store") if store else None,
           "finish": str(s.get("finish") or ""), "max_fix_rounds": int(pr.get("max_fix_rounds") if isinstance(pr.get("max_fix_rounds"), int) else 2),
           "after_limit": str(pr.get("after_limit") or "ask"), "react": bool(pr.get("react")),
           "poll_interval": duration(pr.get("poll_interval"), 300)}
    return out


def review_requests(c):
    """The re-requests this repo's settings call for after a push (SKILL: Re-request review)."""
    if c["requests_disabled"]:
        return []
    if c["reviewers"]:
        poster = c["request_as"] or c["review_request"]["login"] or c["login"]
        return [{"body": r["request"], "poster": poster} for r in c["reviewers"].values() if r["request"]]
    rr = c["review_request"]
    if rr["body"] and rr["after_fixes"]:
        return [{"body": rr["body"], "poster": rr["login"] or c["login"]}]
    return []


# ---- GitHub ----------------------------------------------------------------------------------------------------
def unknown(msg):
    raise Stop("lookup_failed", f"GitHub state unknown: {msg}", code=3, unknown=True)


def decode_pages(text):
    dec, i, pages = json.JSONDecoder(), 0, []
    while True:
        while i < len(text) and text[i].isspace():
            i += 1
        if i >= len(text):
            return pages
        obj, i = dec.raw_decode(text, i)
        pages.append(obj)


def gh_list(endpoint):
    r = gh("api", "--paginate", endpoint)
    if r.returncode != 0:
        unknown((r.stderr or r.stdout).strip() or f"gh exited {r.returncode}")
    try:
        pages = decode_pages(r.stdout)
    except ValueError as e:
        unknown(f"unreadable response: {e}")
    items = []
    for p in pages:
        if not isinstance(p, list):
            unknown("unexpected response shape")
        items.extend(p)
    if not pages:
        unknown("empty response")
    return items


def gh_obj(endpoint, *extra):
    r = gh("api", *extra, endpoint)
    if r.returncode != 0:
        unknown((r.stderr or r.stdout).strip() or f"gh exited {r.returncode}")
    try:
        return json.loads(r.stdout)
    except ValueError as e:
        unknown(f"unreadable response: {e}")


def ambient_login():
    r = gh("api", "user", "--jq", ".login")
    if r.returncode != 0 or not r.stdout.strip():
        unknown("cannot read the ambient gh login")
    return r.stdout.strip()


def norm_pr(p):
    state = "MERGED" if p.get("merged_at") else ("OPEN" if p.get("state") == "open" else "CLOSED")
    return {"number": p["number"], "url": p["html_url"], "state": state, "base": (p.get("base") or {}).get("ref"),
            "head_sha": (p.get("head") or {}).get("sha"), "merged_at": p.get("merged_at"), "title": p.get("title", "")}


def discover(repo, branch, base=None, states=None):
    owner = repo.split("/")[0]
    items = gh_list(f"repos/{repo}/pulls?state=all&head={owner}:{branch}&per_page=100")
    own = {}
    for p in items:  # a same-named PR from a fork is not the change's PR
        head = p.get("head") or {}
        if ((head.get("repo") or {}).get("full_name") or "").lower() == repo.lower() and head.get("ref") == branch:
            own[p["number"]] = norm_pr(p)
    prs = sorted(own.values(), key=lambda p: -p["number"])
    other = []
    if base:
        other = [p for p in prs if p["base"] != base]
        prs = [p for p in prs if p["base"] == base]
    if states and "all" not in states:
        prs = [p for p in prs if p["state"].lower() in states]
    return {"ok": True, "repo": repo, "branch": branch, "base": base, "prs": prs, "other_base": other,
            "newest": prs[0] if prs else None}


def pr_of(prs):
    return next((p for p in prs if p["state"] == "OPEN"), prs[0] if prs else None)


# ---- subcommands -----------------------------------------------------------------------------------------------
def cmd_identity(argv):
    _, pos = parse_args(argv, {})
    if len(pos) != 1:
        usage("identity <dir>")
    return identity(pos[0])


def cmd_context(argv):
    a, _ = parse_args(argv, {"--code": "code", "--store": "store"})
    need(a, "code")
    c = contexts(a["code"], a.get("store"))
    for k, d in (("code", a["code"]), ("store", a.get("store"))):
        if c[k] is not None:
            try:
                c[k]["repo"] = identity(d)["repo"]
            except Stop:
                c[k]["repo"] = None
    return {"ok": True, **c}


def cmd_discover(argv):
    a, _ = parse_args(argv, {"--repo": "repo", "--branch": "branch", "--base": "base", "--state": "state"})
    need(a, "repo", "branch")
    states = [s.strip().lower() for s in a["state"].split(",")] if a.get("state") else None
    return discover(a["repo"], a["branch"], a.get("base"), states)


def count_commits(d, main, branch):
    mref = main_ref(d, main)
    if not mref or not has_ref(d, f"refs/heads/{branch}"):
        return 0
    r = git(d, "rev-list", "--count", f"{mref}..refs/heads/{branch}")
    return int(r.stdout.strip() or 0) if r.returncode == 0 else 0


def expected_set(code, store, branch):
    ctx = contexts(code, store)
    cid = identity(code)
    cmain, smain = ctx["code"]["main"], ctx["store"]["main"]
    cd = discover(cid["repo"], branch, base=cmain)
    commits = count_commits(code, cmain, branch)
    code_exp = bool(cd["prs"]) or commits > 0
    code_side = {"expected": code_exp, "repo": cid["repo"], "main": cmain, "commits": commits,
                 "reason": "pr_exists" if cd["prs"] else ("commits" if commits > 0 else "none"),
                 "pr": pr_of(cd["prs"]), "other_base": cd["other_base"]}
    try:
        sid = identity(store)
    except Stop as e:
        if e.error not in ("not-github", "no-origin"):
            raise
        sid = None
    store_side = {"expected": sid is not None, "repo": sid["repo"] if sid else None, "main": smain,
                  "reason": "github_origin" if sid else "no_github_origin", "pr": None, "other_base": []}
    if sid:
        read_store_as(ctx, sid["repo"])
        sd = discover(sid["repo"], branch, base=smain)
        store_side["pr"], store_side["other_base"] = pr_of(sd["prs"]), sd["other_base"]
    members = [k for k, side in (("store", store_side), ("code", code_side)) if side["expected"]]
    report = {("store", "code"): ("both", "Both PR URLs."),
              ("code",): ("code_only", "Code PR only; the store branch is shared by hand."),
              ("store",): ("store_only", "Store PR only; the change has no code changes."),
              (): ("none", "No PR to open: the store branch is shared by hand and nothing is watched.")}[tuple(members)]
    return {"ok": True, "branch": branch, "set": members, "code": code_side, "store": store_side,
            "ship": {"report": report[0], "note": report[1]}, "contexts": ctx}


def public(e):
    return {k: v for k, v in e.items() if k != "contexts"}


def cmd_expected(argv):
    a, _ = parse_args(argv, {"--code": "code", "--store": "store", "--branch": "branch"})
    need(a, "code", "store", "branch")
    return public(expected_set(a["code"], a["store"], a["branch"]))


def temp_file(text):
    f = tempfile.NamedTemporaryFile("w", delete=False, suffix=".json", encoding="utf-8", newline="\n")
    f.write(text)
    f.close()
    return f.name


def cmd_ensure_pr(argv):
    a, _ = parse_args(argv, {"--repo": "repo", "--branch": "branch", "--base": "base", "--title": "title", "--body-file": "body_file"})
    need(a, "repo", "branch", "base", "title", "body_file")
    repo, branch, base = a["repo"], a["branch"], a["base"]
    d = discover(repo, branch)["prs"]
    opens = [p for p in d if p["state"] == "OPEN"]
    for p in opens:
        if p["base"] != base:
            raise Stop("wrong_base", f"PR #{p['number']} {p['url']} targets {p['base']}, not {base}; nothing was opened or linked",
                       pr=p, base=p["base"])
    if opens:
        return {"ok": True, "action": "found", "pr": opens[0]}
    based = [p for p in d if p["base"] == base]
    if based and based[0]["state"] == "MERGED":
        raise Stop("already_merged", f"PR #{based[0]['number']} {based[0]['url']} from {branch} is already merged; not opening another",
                   pr=based[0])
    r = gh("pr", "create", "--repo", repo, "--head", branch, "--base", base, "--title", a["title"], "--body-file", a["body_file"])
    if r.returncode != 0:
        raise Stop("create_failed", (r.stderr or r.stdout).strip() or "gh pr create failed")
    m = re.search(r"(https://\S+/pull/(\d+))", r.stdout)
    if not m:
        raise Stop("create_failed", f"gh pr create printed no PR URL: {r.stdout.strip()}")
    return {"ok": True, "action": "created", "pr": {"number": int(m.group(2)), "url": m.group(1), "state": "OPEN", "base": base}}


def cmd_link(argv):
    a, _ = parse_args(argv, {"--repo": "repo", "--pr": "pr", "--kind": "kind", "--peer-url": "peer", "--login": "login"})
    need(a, "repo", "pr", "kind", "peer")
    repo, n, kind, peer = a["repo"], a["pr"], a["kind"], a["peer"]
    if kind not in ("store", "code"):
        usage("--kind is store or code")
    pr = gh_obj(f"repos/{repo}/pulls/{n}")
    if peer in (pr.get("body") or ""):
        return {"ok": True, "action": "skipped", "reason": "description"}
    comments = gh_list(f"repos/{repo}/issues/{n}/comments?per_page=100")
    found = []
    for c in comments:
        m = MARK.search(c.get("body") or "")
        if m and m.group(1) == kind:
            found.append((c, m.group(2)))
    for c, url in found:
        if url == peer:
            return {"ok": True, "action": "skipped", "reason": "marker", "comment_id": c["id"]}
    login = (a.get("login") or ambient_login()).lower()
    mine = [c for c, _ in found if ((c.get("user") or {}).get("login") or "").lower() == login]
    label = "Store" if kind == "store" else "Code"
    body = json.dumps({"body": f"{label} PR for this change: {peer}\n\n<!-- specwright:link {kind} {peer} -->\n"})
    f = temp_file(body)
    try:
        if mine:  # only Specwright's own comment is ever edited
            r = gh("api", "-X", "PATCH", f"repos/{repo}/issues/comments/{mine[-1]['id']}", "--input", f)
            action, cid = "updated", mine[-1]["id"]
        else:
            r = gh("api", "-X", "POST", f"repos/{repo}/issues/{n}/comments", "--input", f)
            action, cid = "created", None
    finally:
        os.unlink(f)
    if r.returncode != 0:
        raise Stop("link_failed", (r.stderr or r.stdout).strip() or "gh api failed")
    try:
        cid = cid or json.loads(r.stdout).get("id")
    except ValueError:
        pass
    return {"ok": True, "action": action, "comment_id": cid}


def readiness(s, dropped):
    """The existing readiness test of SKILL.md watch step 3, minus 'no new activity for one full wait'."""
    if s is None:
        return False, ["no_snapshot"], False
    b = []
    if not s.get("complete", True):
        b.append("incomplete")
    if s.get("pending_review"):
        b.append("pending_review")
    if s.get("state", "OPEN") != "OPEN":
        b.append("not_open")
    if s.get("mergeable") != "MERGEABLE":
        b.append("not_mergeable")
    if s.get("merge_state") != "CLEAN":
        b.append(f"merge_state:{s.get('merge_state')}")
    ck = s.get("checks") or {}
    if ck.get("pending"):
        b.append("checks_pending")
    if ck.get("failing"):
        b.append("checks_failing")
    for kind in ("threads", "comments", "reviews"):
        if [i for i in s.get(kind) or [] if f"{i.get('id')}@{i.get('rev')}" not in dropped]:
            b.append(kind)
    for r in s.get("reviewers") or []:
        if r.get("role", "required") == "required" and r.get("state") != "reported":
            b.append(f"reviewer:{r.get('login')}:{r.get('state')}")
        elif r.get("role") == "advisory" and r.get("state") == "waiting":
            b.append(f"reviewer:{r.get('login')}:waiting")
    stale_only = b == ["merge_state:BLOCKED"] and bool(s.get("stale_verdicts"))
    return not b, b, stale_only


def read_snapshots(a):
    out = {}
    for spec in a.get("snapshot", []):
        name, _, path = spec.partition("=")
        if name not in ("code", "store") or not path:
            usage("--snapshot is code=<file> or store=<file>")
        try:
            out[name] = json.loads(Path(path).read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            raise Stop("snapshot_unreadable", f"{path}: {e}", code=2)
    return out


def cmd_pair_state(argv):
    a, _ = parse_args(argv, {"--code": "code", "--store": "store", "--branch": "branch", "--snapshot": "+snapshot", "--dropped": "+dropped"})
    need(a, "code", "store", "branch")
    e = expected_set(a["code"], a["store"], a["branch"])
    snaps, dropped = read_snapshots(a), set(a.get("dropped", []))
    members = e["set"]
    states = {k: (e[k]["pr"]["state"] if e[k]["pr"] else None) for k in members}
    r = {"ok": True, "set": members, "states": states, "waits": [], "ready": {}, "waiting_on": [], "blocking": {}, "missing": [],
         "merged": [], "closed": [], "open": [], "stop_waits": False, "archive": False, "rerequest": False,
         "share_store_by_hand": "code" in members and "store" not in members,
         "prs": {k: e[k]["pr"] for k in members}, "ship": e["ship"]}
    if not members:
        return {**r, "action": "no_watch"}
    r["missing"] = [k for k in members if states[k] is None]
    r["merged"] = [k for k in members if states[k] == "MERGED"]
    r["closed"] = [k for k in members if states[k] == "CLOSED"]
    r["open"] = [k for k in members if states[k] == "OPEN"]
    if r["missing"]:
        return {**r, "action": "ship"}
    ended = r["merged"] + r["closed"]
    if ended and r["open"]:
        return {**r, "action": "split_hand_off", "stop_waits": True}
    if ended:
        return {**r, "action": "cleanup", "stop_waits": True}
    for k in members:
        ok, blockers, stale_only = readiness(snaps.get(k), dropped)
        r["ready"][k] = ok
        if not ok:
            r["blocking"][k] = blockers
            r["waiting_on"].append(k)
            if stale_only:
                r.setdefault("ready_except_stale_verdicts", []).append(k)
    r["waits"] = list(members)
    return {**r, "action": "ready" if not r["waiting_on"] else "wait"}


def remote_contains(d, branch, sha):
    r = git(d, "ls-remote", "origin", f"refs/heads/{branch}")
    if r.returncode != 0:
        raise Stop("remote_unreadable", f"git ls-remote origin failed in {d}: {r.stderr.strip()}", code=3, unknown=True)
    line = r.stdout.strip().split("\n")[0].strip()
    if not line:
        return False
    remote = line.split()[0]
    if remote == sha:
        return True
    if git(d, "cat-file", "-e", remote + "^{commit}").returncode != 0:
        # another checkout pushed a tip this repo lacks: fetch it (FETCH_HEAD only, no local ref moves) before the ancestry test
        git(d, "fetch", "-q", "origin", f"refs/heads/{branch}")
    r = git(d, "merge-base", "--is-ancestor", sha, remote)
    if r.returncode in (0, 1):
        return r.returncode == 0
    raise Stop("remote_unreadable", f"cannot tell whether origin/{branch} contains {sha} in {d}: {r.stderr.strip()}", code=3, unknown=True)


def branch_log(d, rng, branch_ref):
    """[(sha, subject, body)] for `git log rng`, newest first; None when git cannot resolve the range."""
    r = git(d, "log", rng, "--format=%H%x1f%s%x1f%B%x1e")
    if r.returncode != 0:
        return None
    out = []
    for rec in r.stdout.split("\x1e"):
        if rec.strip():
            sha, subj, body = (rec.strip("\n").split("\x1f") + ["", ""])[:3]
            out.append((sha.strip(), subj, body))
    return out


def cmd_rounds(argv):
    a, _ = parse_args(argv, {"--code": "code", "--store": "store", "--branch": "branch"})
    need(a, "code", "store", "branch")
    ctx = contexts(a["code"], a["store"])
    per, rounds_all = {}, {}
    for k, d in (("code", a["code"]), ("store", a["store"])):
        mref = main_ref(d, ctx[k]["main"])
        commits = branch_log(d, f"{mref}..refs/heads/{a['branch']}", None) if mref and has_ref(d, f"refs/heads/{a['branch']}") else []
        commits = commits or []
        trailers = {sha: max([int(x) for x in TRAILER.findall(body)] or [0]) for sha, _, body in commits}
        per[k] = {"max_trailer": max(trailers.values(), default=0), "trailers": trailers,
                  "subject_count": sum(1 for _, s, _ in commits if LEGACY_SUBJECT.search(s))}
    rounds = max(per["code"]["max_trailer"], per["store"]["max_trailer"], per["code"]["subject_count"], per["store"]["subject_count"])
    top = max(per["code"]["max_trailer"], per["store"]["max_trailer"])
    unpushed, unreadable = {}, []
    if top:
        for k, d in (("code", a["code"]), ("store", a["store"])):
            shas = [s for s, n in per[k]["trailers"].items() if n == top]
            try:
                missing = [s for s in shas if not remote_contains(d, a["branch"], s)]
            except Stop:  # the count does not depend on the remote; say which side could not be checked
                unreadable.append(k)
                continue
            if missing:
                unpushed[k] = missing
    limit = ctx["max_fix_rounds"]
    for k in per:
        del per[k]["trailers"]
    return {"ok": True, "rounds": rounds, "code": per["code"], "store": per["store"], "max_fix_rounds": limit,
            "limit_reached": rounds >= limit, "after_limit": ctx["after_limit"], "unpushed": unpushed,
            "remote_unreadable": unreadable}


# ---- the feedback pass record ----------------------------------------------------------------------------------
def record_path(code_repo, change):
    base = os.environ.get("SPECWRIGHT_STATE_DIR") or str(Path.home() / ".cache" / "specwright")
    owner, _, name = code_repo.partition("/")
    safe = lambda s: re.sub(r"[^A-Za-z0-9._-]", "_", s)
    return Path(base) / "feedback" / f"{safe(owner)}-{safe(name)}-{safe(change)}.json"


def load_record(p):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except ValueError as e:
        raise Stop("record_unreadable", f"{p}: {e}")


def find_marker(store, branch, change, prefix, main=None):
    """The planning-only marker of this change's own archive, under the selected root only: another root's marker is not
    ours, and neither is an earlier archive of a reused change name - that one is already on the store's main."""
    archive = f"{prefix}/changes/archive"
    r = git(store, "ls-tree", "-d", "--name-only", f"refs/heads/{branch}", "--", archive + "/")
    if r.returncode != 0:
        return None
    rx = re.compile("^" + re.escape(archive) + r"/(\d{4}-\d{2}-\d{2}-)?" + re.escape(change) + "$")
    dirs = [d for d in r.stdout.split("\n") if rx.search(d)]
    mref = main_ref(store, main) if main else None
    if mref:
        dirs = [d for d in dirs if git(store, "cat-file", "-e", f"{mref}:{d}").returncode != 0]
    if len(dirs) > 1:
        raise Stop("marker_ambiguous", f"more than one archive of {change} on {branch} is not on the store's main: {', '.join(dirs)}",
                   paths=dirs)
    for d in dirs:
        path = f"{d}/specwright-change.yaml"
        body = git(store, "show", f"refs/heads/{branch}:{path}")
        if body.returncode == 0 and re.search(r"^code_changes:\s*none\s*$", body.stdout, re.M):
            return path
    return None


def edit_repo(f, e):
    """The repo an edit lands in: its own `repo` (required when the finding's destination is `both`), else the finding's."""
    return e.get("repo") or f["destination"]


def edits_for(f, k):
    return [e for e in f["edits"] if edit_repo(f, e) == k]


def pass_args(argv, extra=None):
    spec = {"--code": "code", "--store": "store", "--code-repo": "code_repo", "--change": "change", "--snapshot": "+snapshot"}
    spec.update(extra or {})
    a, _ = parse_args(argv, spec)
    need(a, "code", "store", "code_repo", "change")
    return a


def pass_write(argv):
    a = pass_args(argv, {"--intent": "intent", "--store-prefix": "prefix"})
    need(a, "intent")
    prefix = (a.get("prefix") or "openspec").strip("/")
    try:
        intent = json.loads(Path(a["intent"]).read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise Stop("invalid_intent", f"{a['intent']}: {e}", code=2)
    for key in ("branch", "round", "prs", "findings"):
        if key not in intent:
            raise Stop("invalid_intent", f"intent lacks '{key}'", code=2)
    path = record_path(a["code_repo"], a["change"])
    if path.exists():
        raise Stop("record_exists", f"a feedback pass record exists at {path}; resume that pass before starting another", path=str(path))
    seen = set()
    if not isinstance(intent["findings"], list) or not all(isinstance(f, dict) for f in intent["findings"]):
        raise Stop("invalid_intent", "findings must be a list of objects", code=2)
    for f in intent["findings"]:
        # everything `pass plan` reads from a finding is checked here: a record it cannot read would block every later pass
        for key in ("id", "item", "source", "destination", "edits", "disposition", "revision"):
            if key not in f:
                raise Stop("invalid_intent", f"finding {f.get('id')} lacks '{key}'", code=2)
        if (f["id"] in seen or f["destination"] not in ("code", "store", "both") or f["source"] not in ("code", "store")
                or not isinstance(f["item"], str) or not f["item"] or f.get("kind", "thread") not in ("thread", "comment", "review")
                or not isinstance(f["disposition"], dict) or not isinstance(f["revision"], dict)
                or not isinstance(f["edits"], list) or not f["edits"]
                or not all(isinstance(e, dict) and isinstance(e.get("file"), str) and e["file"] for e in f["edits"])):
            raise Stop("invalid_intent", f"finding {f['id']} is duplicated or malformed", code=2)
        seen.add(f["id"])
        for e in f["edits"]:
            r = e.get("repo")
            if (f["destination"] == "both" and r not in ("code", "store")) or (f["destination"] != "both" and r not in (None, f["destination"])):
                raise Stop("invalid_intent", f"finding {f['id']}: edit {e.get('file')} needs repo code|store matching the destination", code=2)
        for e in edits_for(f, "store"):
            if not norm(e["file"]).startswith(prefix + "/"):
                raise Stop("misrouted", f"finding {f['id']}: {e['file']} is not under {prefix}/, so it does not belong to the store branch",
                           finding=f["id"], file=e["file"])
    heads = {}
    for k in ("code", "store"):
        r = git(a[k], "rev-parse", f"refs/heads/{intent['branch']}")
        if r.returncode != 0:
            raise Stop("branch_missing", f"{k} has no branch {intent['branch']}")
        heads[k] = r.stdout.strip()
    marker = find_marker(a["store"], intent["branch"], a["change"], prefix, (contexts(a["code"], a["store"])["store"] or {}).get("main")) if any(edits_for(f, "code") for f in intent["findings"]) else None
    rec = {**intent, "change": a["change"], "code_repo": a["code_repo"], "heads": heads, "marker": marker, "version": 1}
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(rec, indent=2))
    os.replace(tmp, path)
    return {"ok": True, "path": norm(path), "round": rec["round"], "heads": heads, "marker": marker}


def listify(v):
    return [] if v is None else (v if isinstance(v, list) else [v])


def judge(d, e):
    p = Path(d) / e["file"]
    if e.get("deleted"):
        return "pending" if p.exists() else "done"
    contains, absent = listify(e.get("contains")), listify(e.get("absent"))
    if not contains and not absent:
        return "unjudgeable"
    if not p.is_file():
        return "pending"
    t = p.read_text(encoding="utf-8", errors="replace")
    return "done" if all(c in t for c in contains) and not any(x in t for x in absent) else "pending"


def dirty_paths(d):
    r = git(d, "status", "--porcelain", "-z", "-uall")
    parts, out, i = r.stdout.split("\0"), set(), 0
    while i < len(parts):
        s = parts[i]
        i += 1
        if len(s) > 3:
            out.add(s[3:])
            if s[0] in "RC" or s[1] in "RC":
                i += 1  # the old name follows a rename
    return out


def fix_commit(d, head0, branch, n):
    # a reset, rebase or force-update can drop the recorded head while `head0..branch` still resolves
    if git(d, "merge-base", "--is-ancestor", head0, f"refs/heads/{branch}").returncode != 0:
        return None, False
    commits = branch_log(d, f"{head0}..refs/heads/{branch}", None)
    if commits is None:
        return None, False
    for sha, _, body in commits:  # newest first
        if n in [int(x) for x in TRAILER.findall(body)]:
            return sha, True
    return None, True


def request_state(repo, num, branch, tip, reqs):
    """Which re-requests exist after the push of `tip` (GitHub timestamps only)."""
    acts = gh_list(f"repos/{repo}/activity?ref=refs/heads/{branch}&per_page=100")
    pushed = next((x.get("timestamp") for x in acts if x.get("after") == tip), None)
    comments = gh_list(f"repos/{repo}/issues/{num}/comments?per_page=100")
    out = []
    for r in reqs:
        poster = (r["poster"] or ambient_login()).lower()
        done = bool(pushed) and any(((c.get("user") or {}).get("login") or "").lower() == poster
                                    and (c.get("body") or "").strip() == r["body"].strip()
                                    and (c.get("created_at") or "") >= pushed for c in comments)
        out.append({"body": r["body"], "poster": r["poster"], "done": done})
    return out, pushed


def pass_plan(argv):
    a = pass_args(argv)
    path = record_path(a["code_repo"], a["change"])
    rec = load_record(path)
    if rec is None:
        return {"ok": True, "record": False, "new_pass_allowed": True, "status": "none", "rows": [], "stops": [],
                "delete_record": False, "needs_user": False}
    snaps = read_snapshots(a)
    findings, n, branch, prs = rec["findings"], rec["round"], rec["branch"], rec.get("prs") or {}
    for src in sorted({f["source"] for f in findings}):
        if src not in snaps:
            raise Stop("snapshot_required", f"pass plan needs --snapshot {src}=<file> (a fresh pr-snapshot.sh of that PR)", code=2, source=src)
    ctx = contexts(a["code"], a["store"])
    dirs = {"code": a["code"], "store": a["store"]}
    marker = rec.get("marker")
    dests = [k for k in ("store", "code") if any(edits_for(f, k) for f in findings) or (k == "store" and marker)]
    rows, stops = [], []
    fix, tip, pushed, slug = {}, {}, {}, {}
    for k in ("code", "store"):
        slug[k] = (prs.get(k) or {}).get("repo") or (rec["code_repo"] if k == "code" else None)
    read_store_as(ctx, slug["store"])

    for k in dests:  # 1. fix commits
        d = dirs[k]
        r = git(d, "rev-parse", f"refs/heads/{branch}")
        if r.returncode != 0:
            raise Stop("branch_missing", f"{k} has no branch {branch}")
        tip[k] = r.stdout.strip()
        sha, ok = fix_commit(d, rec["heads"][k], branch, n)
        if not ok:
            stops.append({"reason": "head_unreachable", "repo": k, "detail": f"{rec['heads'][k]} is not reachable from {branch}"})
        edits = [{**e, "finding": f["id"]} for f in findings for e in edits_for(f, k)]
        if k == "store" and marker:
            edits.append({"file": marker, "deleted": True, "finding": "marker"})
        files = sorted({norm(e["file"]) for e in edits})
        row = {"step": "fix_commit", "repo": k, "state": "done" if sha else "todo", "sha": sha, "trailer": f"Feedback-Round: {n}",
               "files": files}
        # judged even when a trailer commit exists: an interrupted pass can commit and push only part of its edits
        verdicts = [(e, judge(d, e)) for e in edits]
        pending = [{"file": norm(e["file"]), "finding": e["finding"], "reason": "not_made"} for e, v in verdicts if v == "pending"]
        for e, v in verdicts:
            if v == "unjudgeable":
                stops.append({"reason": "edit_unjudgeable", "repo": k, "finding": e["finding"], "file": norm(e["file"]),
                              "detail": "the recorded edit has no contains/absent/deleted check, so it cannot be judged done"})
        dirty = dirty_paths(d)
        extra = sorted(dirty - set(files))
        if extra:
            stops.append({"reason": "unrecorded_change", "repo": k, "files": extra,
                          "detail": "the working tree has changes outside the files this pass recorded"})
        uncommitted = sorted(dirty & set(files))
        blocked = bool(pending) or any(v == "unjudgeable" for _, v in verdicts) or bool(extra)
        if sha and (blocked or uncommitted):  # the trailer commit holds only part of the pass: commit the rest under it
            sha = None
            row.update(state="todo", sha=None, partial_commit=row["sha"])
        if not sha:
            row.update({"pending_edits": pending, "committable": not blocked,
                        "action": "finish_edits" if pending else ("ask" if blocked else "validate_and_commit")})
        fix[k] = sha
        rows.append(row)

    def unmet(*ids):
        return [i for i in ids if not any(r["step"] + ":" + r["repo"] == i and r["state"] in ("done", "not_applicable") for r in rows if "repo" in r)]

    if "code" in dests and not prs.get("code"):  # a code fix on a store-only change: the code PR is now expected
        opened = [p for p in discover(slug["code"], branch, base=ctx["code"]["main"])["prs"] if p["state"] == "OPEN"]
        if opened:
            prs = {**prs, "code": {"repo": slug["code"], "number": opened[0]["number"]}}

    for k in dests:  # 2. push
        pr = prs.get(k)
        row = {"step": "push", "repo": k, "branch": branch, "after": [], "blocked": False}
        if not pr and k == "code":
            after = unmet("fix_commit:code") + (unmet("fix_commit:store") if marker else [])
            row.update(state="todo", action="ship", after=after, blocked=bool(after),
                       detail="the code repo now has commits but no open code PR: ship it (push, ensure-pr, review request), then plan again")
        elif not pr:
            row.update(state="not_applicable", share_by_hand=True)
        else:
            after = unmet(f"fix_commit:{k}")
            if k == "code" and marker:
                after += unmet("fix_commit:store")
            row["after"], row["blocked"] = after, bool(after)
            row["state"] = "todo" if after or not fix[k] else ("done" if remote_contains(dirs[k], branch, fix[k]) else "todo")
        pushed[k] = row["state"] in ("done", "not_applicable")
        rows.append(row)

    for k in dests:  # 3. re-request review
        pr = prs.get(k)
        reqs = review_requests(ctx[k]) if pr else []
        row = {"step": "rerequest", "repo": k, "pr": ({"repo": pr["repo"], "number": pr["number"]} if pr else None),
               "requests": [{"body": r["body"], "poster": r["poster"], "done": False} for r in reqs]}
        if not reqs:
            row["state"] = "not_applicable"
        else:
            row["after"] = unmet(f"push:{k}")
            row["blocked"] = bool(row["after"])
            row["state"] = "todo"
            if not row["after"]:
                states, pushed_at = request_state(pr["repo"], pr["number"], branch, tip[k], reqs)
                row["requests"], row["push_time"] = states, pushed_at
                row["state"] = "done" if all(s["done"] for s in states) else "todo"
        rows.append(row)

    react_on = ctx["react"]
    for f in findings:  # 4-6. reply, resolution, reaction
        src, kind = f["source"], f.get("kind", "thread")
        ks = [k for k in ("store", "code") if edits_for(f, k)]
        s = snaps[src]
        items = s.get({"thread": "threads", "comment": "comments", "review": "reviews"}[kind]) or []
        item = next((i for i in items if i.get("id") == f["item"]), None)
        rev0, last0 = f["revision"].get("rev"), f["revision"].get("last_reviewer_comment") or {}
        viewer, disp = s.get("viewer"), f["disposition"]
        want_resolve = bool(disp.get("resolve")) and kind == "thread"
        reaction = disp.get("react") if react_on and disp.get("react") in ("+1", "-1") else None
        answered, stale, activity = item is None, False, []
        if item is not None:
            cs = item.get("comments") or []
            if kind == "thread" and (item.get("awaiting_reviewer") or any(
                    c.get("author") == viewer and (c.get("at") or "") > (last0.get("at") or "") for c in cs)):
                answered = True
            elif item.get("rev") != rev0:
                stale = True
                if kind == "thread":
                    activity = [{"id": c.get("id"), "author": c.get("author"), "at": c.get("at"), "edited": c.get("edited")} for c in cs
                                if c.get("author") != viewer and max(c.get("at") or "", c.get("edited") or "") > (last0.get("at") or "")]
                else:
                    activity = [{"id": item.get("id"), "author": item.get("author"), "at": item.get("at"), "edited": None}]
        base = {"finding": f["id"]}
        if stale:
            stops.append({"reason": "stale_disposition", "finding": f["id"], "item": f["item"], "new_activity": activity,
                          "detail": "the reviewer added to or edited this item since the disposition was judged; post nothing, list the activity and ask"})
            rows.append({**base, "step": "reply", "state": "stopped"})
            rows.append({**base, "step": "resolve", "state": "stopped"})
            rows.append({**base, "step": "react", "state": "stopped"})
            continue
        pr = prs.get(src) or {}
        after = [i for k in ks for i in unmet(f"fix_commit:{k}", f"push:{k}")]
        links = [{"repo": slug[k], "sha": fix.get(k)} for k in ks]
        reply = {**base, "step": "reply", "state": "done" if answered else "todo", "kind": kind, "item": f["item"], "root_id": f.get("root_id"),
                 "pr": {"repo": pr.get("repo"), "number": pr.get("number")}, "resolve": want_resolve and not answered,
                 "react": reaction if not answered else None, "link_commit": links[0], "link_commits": links,
                 "after": [] if answered else after, "blocked": bool(after) and not answered}
        rows.append(reply)
        if not want_resolve:
            res = {**base, "step": "resolve", "state": "not_applicable"}
        elif item is None or item.get("resolved"):
            res = {**base, "step": "resolve", "state": "done"}
        elif not answered:
            res = {**base, "step": "resolve", "state": "todo", "after": [f"reply:{f['id']}"]}
        else:
            res = {**base, "step": "resolve", "state": "ask", "thread": f["item"], "resolve_pending": bool(item.get("resolve_pending")),
                   "detail": "the reply is posted but the thread is unresolved: list it and ask; never re-resolve silently"}
        rows.append(res)
        target = f.get("root_id") if kind == "thread" else f["item"]
        if not reaction:
            rows.append({**base, "step": "react", "state": "not_applicable"})
        else:
            rows.append({**base, "step": "react", "state": "rerun" if answered else "todo", "react": reaction, "comment": target,
                         "idempotent": True})

    done_states = ("done", "not_applicable", "rerun")
    complete = not stops and all(r["state"] in done_states for r in rows)
    status = "stop" if stops else ("complete" if complete else "resume")
    return {"ok": True, "record": True, "round": n, "branch": branch, "new_pass_allowed": False, "status": status, "stops": stops,
            "rows": rows, "delete_record": complete, "needs_user": bool(stops) or any(r["state"] == "ask" for r in rows),
            "share_by_hand": [r["repo"] for r in rows if r["step"] == "push" and r.get("share_by_hand")], "path": norm(path)}


def pass_done(argv):
    p = pass_plan(argv)
    if not p.get("record"):
        return {"ok": True, "deleted": False, "record": False}
    if not p["delete_record"]:
        raise Stop("not_complete", "the pass still has steps to do; run pass plan", status=p["status"])
    record_path(pass_args(argv)["code_repo"], pass_args(argv)["change"]).unlink()
    return {"ok": True, "deleted": True}


def cmd_pass(argv):
    if not argv or argv[0] not in ("write", "plan", "done"):
        usage("pass write|plan|done ...")
    return {"write": pass_write, "plan": pass_plan, "done": pass_done}[argv[0]](argv[1:])


def cmd_cleanup(argv):
    a, _ = parse_args(argv, {"--code": "code", "--store": "store", "--branch": "branch"})
    need(a, "code", "store", "branch")
    branch = a["branch"]
    e = expected_set(a["code"], a["store"], branch)
    members, keep, out = e["set"], [], {}
    all_merged = bool(members) and all(e[k]["pr"] and e[k]["pr"]["state"] == "MERGED" for k in members)
    for k, d in (("code", a["code"]), ("store", a["store"])):
        side, main = e[k], e[k]["main"]
        pr, cwd = side["pr"], norm(d)
        exists = has_ref(d, f"refs/heads/{branch}")
        ent = {"expected": side["expected"], "repo": side["repo"], "dir": cwd, "merged": False, "branch_exists": exists, "pr": pr, "commands": []}
        cmd = lambda *c: {"cmd": list(c), "cwd": cwd}
        if side["expected"] and pr and pr["state"] == "MERGED":
            ent["merged"] = True
            if exists:
                tipsha = git(d, "rev-parse", f"refs/heads/{branch}").stdout.strip()
                ent["commands"] = [cmd("git", "checkout", main), cmd("git", "pull", "--ff-only"), cmd("git", "branch", "-d", branch)]
                ent["force_delete"] = ["git", "branch", "-D", branch]  # only when -d refuses and the PR head is this tip
                ent["force_delete_allowed"] = bool(pr.get("head_sha")) and pr["head_sha"] == tipsha
        elif side["expected"]:
            keep.append({"repo": k, "slug": side["repo"], "state": pr["state"] if pr else "NONE", "branch": branch,
                         "url": pr["url"] if pr else None})
        elif k == "store" and exists and side["reason"] == "no_github_origin":  # no PR can merge it: the user shares it by hand
            keep.append({"repo": k, "slug": None, "state": "SHARE_BY_HAND", "branch": branch, "url": None})
        elif k == "code" and exists and all_merged:  # the empty code branch, kept until now
            cur = git(d, "branch", "--show-current").stdout.strip()
            ent["commands"] = ([cmd("git", "checkout", main)] if cur == branch else []) + [cmd("git", "branch", "-d", branch)]
        out[k] = ent
    return {"ok": True, "branch": branch, "set": members, "code": out["code"], "store": out["store"], "keep": keep}


COMMANDS = {"identity": cmd_identity, "context": cmd_context, "discover": cmd_discover, "expected": cmd_expected,
            "ensure-pr": cmd_ensure_pr, "link": cmd_link, "pair-state": cmd_pair_state, "rounds": cmd_rounds,
            "pass": cmd_pass, "cleanup-plan": cmd_cleanup}

args = sys.argv[1:]
try:
    if not args or args[0] not in COMMANDS:
        usage("subcommand: " + " | ".join(COMMANDS))
    emit(COMMANDS[args[0]](args[1:]))
except Stop as e:
    emit(e.obj(), e.code)
except Exception as e:
    emit({"ok": False, "error": "internal_error", "message": f"{type(e).__name__}: {e}"}, 1)
PYSRC
