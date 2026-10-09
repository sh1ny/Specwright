"""The delivered agent, schema, skill and README text carries the rules of fix-agent-skills-and-subjects.

These checks assert where a rule sits and its key terms, not exact wording, in the style of
evals/pr-pair/test_skill_text.py. They prove the rule is in the instructions, not that a live agent
follows it; branch-state and stop paths are covered by the agent evals in evals.json.

Run: python -m unittest discover evals/git-workflow -p "test_instructions.py"
"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CLAUDE_AGENTS = [ROOT / "agents" / "claude" / f"specwright-{n}.md" for n in ("implementer", "reviewer")]
OMP_AGENTS = [ROOT / "agents" / "omp" / f"specwright-{n}.md" for n in ("implementer", "reviewer")]
SCHEMA = ROOT / "schemas" / "specwright" / "schema.yaml"
ROADMAP = ROOT / "skills" / "specwright-roadmap" / "SKILL.md"
README = ROOT / "README.md"
CONTRIBUTING = ROOT / "CONTRIBUTING.md"
COMMIT = ROOT / "skills" / "specwright-commit" / "SKILL.md"


def read(p):
    return p.read_text(encoding="utf-8")


def frontmatter(text):
    m = re.match(r"---\n(.*?)\n---\n", text, re.S)
    return (m.group(1), text[m.end():]) if m else ("", text)


def paragraphs(text):
    """Blank-line separated blocks; list items stay with their block."""
    return [p for p in re.split(r"\n\s*\n", text) if p.strip()]


def find_block(text, *patterns):
    """First paragraph matching every pattern (case-insensitive), or None."""
    for p in paragraphs(text):
        if all(re.search(pat, p, re.I | re.S) for pat in patterns):
            return p
    return None


def section(text, heading_re):
    """Text from a markdown heading matching heading_re up to the next heading of the same or higher level."""
    m = re.search(r"^(#+) " + heading_re + r".*$", text, re.M | re.I)
    if not m:
        return None
    level = len(m.group(1))
    nxt = re.search(r"^#{1,%d} " % level, text[m.end():], re.M)
    return text[m.start(): m.end() + nxt.start()] if nxt else text[m.start():]


def schema_block(key):
    """The YAML block for a top-level-ish key (`apply:`, `- id: review`) up to the next block at its indent."""
    text = read(SCHEMA)
    m = re.search(r"^(\s*)" + key + r".*$", text, re.M)
    assert m, f"schema.yaml has no {key}"
    indent = len(m.group(1))
    nxt = re.search(r"^\s{0,%d}\S" % indent, text[m.end() + 1:], re.M)
    return text[m.start(): m.end() + 1 + nxt.start()] if nxt else text[m.start():]


def step(text, label):
    """`Step N - ...` paragraph of the README install prompt, up to the next step."""
    m = re.search(r"^" + label + r"\b.*?(?=^Step \d+ |^```)", text, re.M | re.S)
    return m.group(0) if m else None


# Loading a named skill: the agent loads/invokes each skill the packet or request names.
LOAD_NAMED = r"(load|invoke)\w*\b.{0,80}\bskill.{0,80}\b(packet|request)\b.{0,40}\bnames?\b|\bskill.{0,60}\b(packet|request)\b.{0,20}\bnames?\b.{0,120}\b(load|invoke)"
NEW_SESSION = r"\bnew (agent )?session\b|session (started|that starts) after"


class AgentDelegation(unittest.TestCase):
    def test_claude_agents_list_skill_and_load_named_skills(self):
        for p in CLAUDE_AGENTS:
            fm, body = frontmatter(read(p))
            tools = re.search(r"^tools:\s*(.*)$", fm, re.M)
            self.assertTrue(tools, f"{p.name}: no tools line")
            self.assertIn("Skill", [t.strip() for t in tools.group(1).split(",")], f"{p.name}: tools lack Skill")
            block = find_block(body, LOAD_NAMED, r"`Skill`")
            self.assertTrue(block, f"{p.name}: no rule to load each named skill with `Skill`")
            self.assertRegex(block, r"(?i)before\b", f"{p.name}: named skills are not loaded before working")

    def test_omp_agents_read_the_given_skill_path(self):
        for p in OMP_AGENTS:
            fm, body = frontmatter(read(p))
            self.assertRegex(fm, r"(?m)^tools:.*\bread\b", f"{p.name}: tools lack read")
            block = find_block(body, LOAD_NAMED, r"`read`", r"SKILL\.md", r"\bpath\b")
            self.assertTrue(block, f"{p.name}: no rule to `read` the SKILL.md path each named skill comes with")
            self.assertNotRegex(block, r"\.claude/skills/<", f"{p.name}: reads a fixed skills path, not the given one")

    def test_agents_never_invoke_specwright_skills(self):
        for p in CLAUDE_AGENTS + OMP_AGENTS:
            _, body = frontmatter(read(p))
            self.assertTrue(find_block(body, r"\bonly\b.{0,60}\bskills?\b.{0,80}\bnames?\b|\bonly the skills\b"),
                            f"{p.name}: does not limit loading to the named skills")
            self.assertTrue(find_block(body, r"\bnever\b.{0,60}`specwright-\*`"),
                            f"{p.name}: does not forbid invoking `specwright-*` workflow skills")

    def test_agents_report_unloaded_skills(self):
        for p in CLAUDE_AGENTS + OMP_AGENTS:
            _, body = frontmatter(read(p))
            self.assertTrue(find_block(body, r"\breport\w*\b.{0,120}\bskill.{0,80}\b(could not|couldn't|not) (be )?load",
                                       ) or find_block(body, r"\bskill.{0,80}\b(could not|couldn't|not) (be )?load.{0,120}\breport"),
                            f"{p.name}: no rule to report a named skill that could not be loaded")
        for p in (CLAUDE_AGENTS[0], OMP_AGENTS[0]):
            _, body = frontmatter(read(p))
            report = body[body.find("Report, in this shape"):]
            self.assertRegex(report, r"(?m)^- Skills:", f"{p.name}: the report shape has no Skills line")

    def test_schema_packets_and_review_requests_name_skills_or_none(self):
        apply = schema_block("apply:")
        deleg = apply[apply.find("DELEGATION"):]
        deleg = deleg[: deleg.find("\n\n")]
        for name, block in (("apply DELEGATION", deleg),
                            ("design review", schema_block("- id: review")),
                            ("roadmap init step 5", (section(read(ROADMAP), "init") or ""))):
            self.assertRegex(block, r"(?is)\bskills?\b.{0,160}`SKILL\.md`.{0,120}\bpath|\bskills?\b.{0,120}\bpath.{0,80}`SKILL\.md`",
                             f"{name}: does not name skills with their installed SKILL.md path")
            self.assertRegex(block, r"(?is)\bskills?\b.{0,300}`none`", f"{name}: no `none` when no skill applies")
        init5 = re.search(r"^5\. \*\*Review\*\*.*$", read(ROADMAP), re.M)
        self.assertTrue(init5, "roadmap init has no step 5 Review")
        self.assertRegex(init5.group(0), r"SKILL\.md", "roadmap init step 5's request does not name skills with paths")

    def test_install_report_requires_new_session_for_agents(self):
        s8 = step(read(README), "Step 8")
        self.assertTrue(s8, "README install prompt has no Step 8")
        self.assertRegex(s8, r"(?is)" + NEW_SESSION, "README Step 8 does not ask for a new session")
        self.assertRegex(s8, r"(?is)skills\b.{0,40}\bagent definitions|agent definitions\b.{0,40}\bskills",
                         "README Step 8 does not name both skills and agent definitions")
        setup = section(read(CONTRIBUTING), "Setup")
        item = re.search(r"^4\. .*$", setup or "", re.M)
        self.assertTrue(item, "CONTRIBUTING Setup has no step 4")
        self.assertRegex(item.group(0), r"(?i)" + NEW_SESSION, "CONTRIBUTING Setup step 4 does not ask for a new session")
        self.assertRegex(item.group(0), r"(?i)agent definitions", "CONTRIBUTING Setup step 4 does not mention agent definitions")

    def test_readme_probe_rejects_old_session(self):
        evals = section(read(README), r"\S* ?Evals")
        self.assertTrue(evals, "README has no Evals section")
        probe = find_block(evals, r"specwright-implementer", r"`Skill`")
        self.assertTrue(probe, "README Evals has no probe that dispatches specwright-implementer and looks for `Skill`")
        self.assertRegex(probe, r"(?is)" + NEW_SESSION, "the probe does not require a session started after install")
        self.assertRegex(probe, r"(?is)(already )?running (before|during)|started before|old session",
                         "the probe does not reject a session that was running before the install")


def commit_step2():
    text = read(COMMIT)
    s = section(text, r"2\. After each task")
    assert s, "specwright-commit SKILL.md has no '## 2. After each task' section"
    return text, s


FIT = r"fit-subject\.sh`?\s+<msgfile>"


class TaskCommits(unittest.TestCase):
    def test_commit_skill_reuses_fitted_message_for_store_pair(self):
        text, s2 = commit_step2()
        fit = re.search(FIT, s2)
        self.assertTrue(fit, "step 2 never runs `fit-subject.sh <msgfile>`")
        self.assertRegex(s2, r"(?is)full message.{0,80}\btemp file|temp file.{0,80}full message",
                         "step 2 does not write the full message to the temp file first")
        commit = re.search(r"git commit -F <msgfile>", s2[fit.end():])
        self.assertTrue(commit, "no `git commit -F <msgfile>` after the fit in step 2")
        self.assertTrue(find_block(s2, r"store", r"\bsame (message )?file\b|\bsame <msgfile>"),
                        "step 2 does not reuse the same message file for the store commit of a pair")
        self.assertRegex(text, r"(?m)^allowed-tools: Bash\(git \*\) Bash\(openspec \*\)$", "allowed-tools changed")

    def test_commit_skill_stops_on_unfittable_subject(self):
        _, s2 = commit_step2()
        block = find_block(s2, r"\bexit 1\b", r"fit-subject|the script|it exits")
        self.assertTrue(block, "step 2 does not say what to do when fit-subject.sh exits 1")
        self.assertRegex(block, r"(?is)\bno commit\b|\bnever commit|do not commit|make no commit", "exit 1 does not stop the commit")
        self.assertRegex(block, r"(?is)\breport\b.{0,80}\btask\b.{0,40}\bsubject\b.{0,40}\blimit\b|\b72\b",
                         "exit 1 does not report the task, the subject and the limit")


def committing_project_files():
    """The roadmap skill's "Committing project files" text, up to the first mode section."""
    text = read(ROADMAP)
    start = text.find("**Committing project files**")
    assert start >= 0, "roadmap SKILL.md has no **Committing project files**"
    return text[start:text.index("\n## init", start)]


def store_part(text):
    """From the first mention of a store-backed project on."""
    m = re.search(r"(?i)store-backed", text)
    return text[m.start():] if m else ""


BRANCH_TEST_STORE = r'test "\$\(git -C "<store toplevel>" branch --show-current\)" = <branch>'
BRANCH_TEST_CD = r'cd "<store toplevel>" && test "\$\(git branch --show-current\)" = <branch> &&'


def mode_block(text, n):
    """Numbered item `n` of a list in `text`, up to the next numbered item or blank line."""
    m = re.search(r"^%d\. .*?(?=^\d+\. |\n\n|\Z)" % n, text, re.M | re.S)
    return m.group(0) if m else ""


class PlanningStores(unittest.TestCase):
    def test_roadmap_store_branch_under_gate_lock(self):
        s = store_part(committing_project_files())
        self.assertTrue(s, "Committing project files has no store-backed part")
        lock = re.search(r"specwright-gate\.lock", s)
        take = re.search(r'mkdir "\$L"', s)
        owner = re.search(r'> "\$L/owner"', s)
        clean = re.search(r"(?i)clean\b.{0,40}\bmain|on (its|the store's) main.{0,60}clean", s)
        busy = re.search(r"(?i)\bbusy\b", s)
        branch = re.search(r"git checkout -b <branch>", s)
        release = re.search(r'rm -r "\$L"', s)
        for name, m in (("the lock path", lock), ("mkdir of the lock", take), ("the owner file", owner),
                        ("the clean-on-main check", clean), ("the busy check", busy), ("git checkout -b", branch),
                        ("the release", release)):
            self.assertTrue(m, f"store-backed Committing project files lacks {name}")
        self.assertLess(take.start(), clean.start(), "the store is checked before the lock is taken")
        self.assertLess(clean.start(), branch.start(), "the branch is created before the store checks")
        self.assertLess(branch.start(), release.start(), "the lock is released before the branch exists")
        held = find_block(s, r"(?i)mkdir.{0,40}fails|lock (exists|is held)", r"(?i)\bstop", r"(?i)owner")
        self.assertTrue(held, "a held lock does not stop and show its owner")
        self.assertRegex(held, r"(?i)only the lock (you|it) took|never remove.{0,60}(another|other)|not yours",
                         "the release is not limited to the lock this run took")
        self.assertNotRegex(s, r"specwright-branch`?\s+(store\S*\s+)?steps?\s+\d", "the gate cites specwright-branch step numbers")

    def test_roadmap_store_checks_code_repo_before_any_branch(self):
        s = store_part(committing_project_files())
        check = mode_block(s, 2)
        self.assertRegex(check, r"(?i)code repo", "step 2 does not check the code repo")
        self.assertRegex(check, r"(?s)(?i)code repo.{0,200}(clean|on its main).{0,200}<branch>.{0,40}exist",
                         "step 2 does not check that the code repo is clean, on main and without <branch>")
        branch = mode_block(s, 3)
        self.assertRegex(branch, r"(?s)(?i)(fails|errors).{0,200}(switch|checkout).{0,80}store.{0,120}(delete|branch -D)",
                         "a failed code branch does not roll the store branch back")
        self.assertRegex(branch, r"(?i)releas", "the rollback does not release the lock")

    def test_roadmap_store_commits_check_branch_in_same_call(self):
        s = store_part(committing_project_files())
        m = re.search(BRANCH_TEST_CD + r"\s*git add -- <files> && git commit", s)
        self.assertTrue(m, "a store commit does not run the branch check in the same call as `git add` and `git commit`")

    def test_roadmap_store_writes_check_branch_and_stop_on_mismatch(self):
        s = store_part(committing_project_files())
        block = find_block(s, BRANCH_TEST_STORE)
        self.assertTrue(block, "store write steps do not start with the store branch check")
        self.assertRegex(block, r"(?i)before (each|every)\b.{0,60}\bwrit", "the check does not run before each store write step")
        stop = find_block(s, r"(?i)mismatch|fails|does not match|another branch", r"(?i)\bstop")
        self.assertTrue(stop, "a branch mismatch does not stop")
        self.assertRegex(stop, r"(?i)\bboth branch|expected.{0,60}found|name.{0,30}(expected|both)",
                         "the stop does not name both the expected and the found branch")


PR_SKILL = ROOT / "skills" / "specwright-pr" / "SKILL.md"


def mode_step(mode, n):
    """Numbered step `n` of a roadmap mode section (`init`, `close`), up to the next numbered step."""
    sec = section(read(ROADMAP), mode + r"\b")
    assert sec, f"roadmap SKILL.md has no ## {mode}"
    m = re.search(r"^%d\. .*?(?=^\d+\. |\Z)" % n, sec, re.M | re.S)
    return m.group(0) if m else ""


class ProjectPlanning(unittest.TestCase):
    def test_roadmap_writes_adrs_proposed(self):
        s4 = mode_step("init", 4)
        self.assertRegex(s4, r"Status: proposed", "init step 4 does not write ADRs as `Status: proposed`")
        self.assertNotRegex(s4, r"Status: accepted", "init step 4 writes ADRs already accepted")
        s45 = s4 + mode_step("init", 5)
        self.assertRegex(s45, r"(?i)(proposed|REVISE).{0,160}\bedit\w*\b.{0,40}\bin place|in place.{0,120}proposed",
                         "a proposed ADR is not edited in place when the review asks to change it")

    def test_roadmap_accepts_adrs_only_after_gate(self):
        sec = section(read(ROADMAP), r"init\b")
        gate = re.search(r"Gate:", sec)
        accept = re.search(r"Status: accepted", sec)
        roadmap = re.search(r"^\d+\. \*\*Roadmap\*\*", sec, re.M)
        self.assertTrue(gate and accept and roadmap, "init lacks the gate, the acceptance or the roadmap step")
        self.assertLess(gate.start(), accept.start(), "ADRs are accepted before the review gate")
        self.assertLess(accept.start(), roadmap.start(), "the roadmap is written before the ADRs are accepted")
        block = find_block(sec, r"Status: accepted")
        self.assertRegex(block, r"(?i)\bdate\b", "acceptance does not record the date")
        self.assertRegex(block, r"(?i)\bindex\b", "acceptance does not add the in-force index rows")
        self.assertRegex(block, r"(?i)(does not|never) void|not void", "the acceptance edit is not exempt from voiding the verdict")

    def test_roadmap_close_reviews_superseding_adr(self):
        s5 = mode_step("close", 5)
        self.assertRegex(s5, r"Status: proposed", "close does not write the superseding ADR as proposed")
        self.assertRegex(s5, r"Supersedes", "close's new ADR does not name what it supersedes")
        self.assertRegex(s5, r"(?i)review\w*.{0,80}(init step 5|like the baseline|as the baseline|architecture-review\.md)",
                         "close does not review the superseding ADR like the baseline")
        self.assertRegex(s5, r"(?i)accept\w*.{0,60}only after|only after.{0,80}accept",
                         "close accepts the superseding ADR before the gate passes")
        self.assertRegex(s5, r"(?i)never edit an accepted ADR|superseded (ADR|file).{0,40}(unchanged|untouched|not touched)",
                         "close may edit the superseded ADR")

    def test_roadmap_review_escalates_after_two_consecutive_revise(self):
        s5 = mode_step("init", 5)
        self.assertNotRegex(s5, r"(?i)at most two rounds", "init step 5 still caps the review at two rounds")
        self.assertRegex(s5, r"(?i)\b(2|two) consecutive\b.{0,20}REVISE", "init step 5 does not escalate after two consecutive REVISE")
        self.assertRegex(s5, r"(?i)escalat|ask the user", "init step 5 does not escalate to the user")
        self.assertRegex(s5, r"USER_OVERRIDE", "init step 5 does not record the user's decision as USER_OVERRIDE")
        self.assertRegex(s5, r"(?i)\bvoids?\b|new round", "a later edit does not void a passing verdict")

    def test_baseline_edit_after_pass_reruns_review(self):
        fb = section(read(PR_SKILL), r"feedback\b")
        block = find_block(fb, r"docs/project-baseline", r"docs/close-")
        self.assertTrue(block, "PR feedback has no rule for the baseline and close branches")
        self.assertRegex(block, r"(?i)strategy.{0,40}architecture.{0,40}ADR", "the rule does not name strategy, architecture and ADRs")
        self.assertRegex(block, r"(?i)(re-?run|run again).{0,60}baseline review|baseline review.{0,60}(again|re-?run)",
                         "the rule does not re-run the baseline review")
        self.assertRegex(block, r"(?i)before.{0,60}(reply|report|done)", "the review is not re-run before the fix is reported done")


def prerequisites():
    """The README's **Prerequisites:** paragraph."""
    return find_block(read(README), r"\*\*Prerequisites:\*\*") or ""


class PrScriptRuntime(unittest.TestCase):
    def test_install_checks_core_and_pr_prerequisites(self):
        pre = prerequisites()
        self.assertRegex(pre, r"(?i)\bbash\b.{0,80}POSIX", "the prerequisites do not list bash with a POSIX userland")
        self.assertRegex(pre, r"`git`", "the prerequisites do not list git")
        self.assertRegex(pre, r"(?i)\bcore\b", "the prerequisites do not mark the core requirements")
        self.assertRegex(pre, r"(?i)gh`? 2\.40.{0,120}Python 3\.8|Python 3\.8.{0,120}gh`? 2\.40",
                         "the prerequisites do not list gh 2.40+ and Python 3.8+ together for the PR skills")
        s1 = step(read(README), "Step 1")
        self.assertTrue(s1, "README has no install Step 1")
        core = find_block(s1, r"git --version", r"command -v awk sed grep")
        self.assertTrue(core, "Step 1 does not check git and the bash userland")
        self.assertRegex(core, r"STOP", "a missing core requirement does not stop the install")
        self.assertRegex(s1, r"(?s)gh --version.{0,80}2\.40", "Step 1 does not check gh 2.40+")
        self.assertRegex(s1, r"(?s)python3.{0,40}python\b", "Step 1 does not probe python3, then python")
        self.assertRegex(s1, r"version_info < \(3, 8\)|3\.8", "Step 1 does not check for Python 3.8+")
        dep = find_block(read(PR_SKILL), r"Scripts live in")
        self.assertRegex(dep or "", r"(?i)\bbash\b.{0,60}\bgit\b.{0,60}gh`? 2\.40.{0,60}Python 3\.8",
                         "specwright-pr does not state bash, git, gh 2.40+ and Python 3.8+")

    def test_install_reports_pr_workflow_not_ready(self):
        s1 = step(read(README), "Step 1")
        pr = find_block(s1 or "", r"gh --version")
        self.assertTrue(pr, "Step 1 has no PR prerequisite check")
        self.assertRegex(pr, r"(?i)(not|never|does not) (block|stop)|without (blocking|stopping)|continue",
                         "a missing PR requirement blocks the install")
        self.assertRegex(pr, r"(?i)record|Step 8", "a missing PR requirement is not carried to the report")
        s8 = step(read(README), "Step 8")
        self.assertRegex(s8 or "", r"PR workflow not ready: <missing>", "Step 8 does not report `PR workflow not ready: <missing>`")


if __name__ == "__main__":
    unittest.main()
