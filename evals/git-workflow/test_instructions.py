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


if __name__ == "__main__":
    unittest.main()
