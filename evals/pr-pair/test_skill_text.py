"""skills/specwright-pr/SKILL.md calls the pr-pair.sh subcommands in the right places.

The script's decisions (identity, discovery, links, pair state, pass records, cleanup) are tested in
test_pr_pair.py; these checks make sure the skill actually uses them, by position in the text and not
by exact wording:

- `pr-pair.sh identity` comes before any push command;
- change PRs are found with `discover`, never with `gh pr list`;
- `link` runs after both PRs exist (after `ensure-pr`, and after the pushes);
- watch uses `pair-state`, feedback uses `pass` and `rounds`, cleanup uses `cleanup-plan`.

Run: python -m unittest discover evals/pr-pair
"""
import re
import unittest
from pathlib import Path

SKILL = Path(__file__).resolve().parents[2] / "skills" / "specwright-pr" / "SKILL.md"
TEXT = SKILL.read_text(encoding="utf-8")


def sub(name):
    """Pattern for `pr-pair.sh <name>` however the path before it is written (bash scripts/..., a variable)."""
    return re.compile(r"pr-pair\.sh[`\"']?\s+" + name + r"\b")


def sections(text):
    """{lowercased '## ' heading: (start offset, section text)}."""
    marks = [(m.start(), m.group(1).strip().lower()) for m in re.finditer(r"^## (.+)$", text, re.M)]
    out = {}
    for i, (start, title) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(text)
        out[title] = (start, text[start:end])
    return out


SECTIONS = sections(TEXT)
# A push command, not prose that mentions pushing: `git push -u origin HEAD`, `git push origin <branch>`.
PUSH = re.compile(r"git push\s+(?:-\S+\s+)*origin")
NEGATION = re.compile(r"\b(not|never|instead|rather than|without|no longer|don't|do not)\b", re.I)


def positions(pattern, text=TEXT):
    return [m.start() for m in pattern.finditer(text)]


class SkillText(unittest.TestCase):
    def section(self, title):
        self.assertIn(title, SECTIONS, f"SKILL.md has no '## {title}' section; found {sorted(SECTIONS)}")
        return SECTIONS[title][1]

    def test_identity_before_any_push(self):
        ident, pushes = positions(sub("identity")), positions(PUSH)
        self.assertTrue(ident, "SKILL.md never runs `pr-pair.sh identity`")
        self.assertTrue(pushes, "SKILL.md has no push command; the check below would be vacuous")
        self.assertLess(ident[0], pushes[0], "the first `git push` comes before the first `pr-pair.sh identity`")
        ship = self.section("ship")
        s_ident, s_push = positions(sub("identity"), ship), positions(PUSH, ship)
        self.assertTrue(s_ident, "the ship section never runs `pr-pair.sh identity`")
        self.assertTrue(s_push, "the ship section has no push command")
        self.assertLess(s_ident[0], s_push[0], "ship pushes before it runs `pr-pair.sh identity`")

    def test_discover_replaces_gh_pr_list_for_change_prs(self):
        self.assertTrue(positions(sub("discover")), "SKILL.md never runs `pr-pair.sh discover`")
        ship = self.section("ship")
        self.assertTrue(positions(sub("discover"), ship), "the ship section does not use `discover` to find a change's PR")
        for m in re.finditer(r"gh pr list", TEXT):
            line = TEXT[TEXT.rfind("\n", 0, m.start()) + 1:TEXT.find("\n", m.end())]
            self.assertRegex(line, NEGATION, f"SKILL.md still finds change PRs with `gh pr list`: {line.strip()[:120]!r}")

    def test_link_after_both_prs_exist(self):
        ship = self.section("ship")
        links, ensures, pushes = positions(sub("link"), ship), positions(sub("ensure-pr"), ship), positions(PUSH, ship)
        self.assertTrue(links, "the ship section never runs `pr-pair.sh link`")
        self.assertTrue(ensures, "the ship section never runs `pr-pair.sh ensure-pr`")
        self.assertLess(max(ensures), links[0], "`link` runs before the last PR is found or created (`ensure-pr`)")
        self.assertTrue(pushes, "the ship section has no push command")
        self.assertLess(pushes[0], links[0], "`link` runs before the first push")

    def test_watch_uses_pair_state_and_cleanup_plan(self):
        watch = self.section("watch")
        self.assertTrue(positions(sub("pair-state"), watch), "the watch section never runs `pr-pair.sh pair-state`")
        plans = positions(sub("cleanup-plan"))
        self.assertTrue(plans, "SKILL.md never runs `pr-pair.sh cleanup-plan`")
        homes = [t for t, (_, body) in SECTIONS.items() if positions(sub("cleanup-plan"), body)]
        self.assertTrue(set(homes) & {"watch"} or any("cleanup" in h for h in homes),
                        f"`cleanup-plan` is in {homes}, neither watch nor a cleanup section")
        self.assertLess(positions(sub("pair-state"))[0], plans[0], "`cleanup-plan` is described before `pair-state`")

    def test_feedback_uses_pass_record_and_rounds(self):
        fb = self.section("feedback")
        for verb in ("write", "plan", "done"):
            self.assertTrue(positions(sub("pass\\s+" + verb), fb), f"the feedback section never runs `pr-pair.sh pass {verb}`")
        self.assertTrue(positions(sub("rounds"), fb), "the feedback section never runs `pr-pair.sh rounds`")
        w = positions(sub("pass\\s+write"), fb)[0]
        self.assertLess(positions(sub("pass\\s+plan"), fb)[0], positions(sub("pass\\s+done"), fb)[0],
                        "`pass done` comes before `pass plan`")
        self.assertLess(positions(sub("rounds"), fb)[0], w, "`rounds` should be read before the pass record is written")

    def test_feedback_uses_pass_record_for_repo_local(self):
        # a repo-local change (no store) uses the same pass record and rounds, with `--store` left out
        repos = self.section("the repos and prs of a change")
        local = next((l for l in repos.splitlines() if l.lstrip("- ").startswith("**Repo-local changes**")), "")
        self.assertTrue(local, "the repos section has no repo-local bullet")
        tail = local.rpartition(";")[2]  # the list of subcommands for store-backed changes only
        for sub_name in ("expected", "pair-state", "cleanup-plan"):
            self.assertIn(f"`{sub_name}`", tail, f"the store-backed-only list does not name `{sub_name}`: {local!r}")
        for sub_name in ("pass", "rounds"):
            self.assertNotIn(f"`{sub_name}`", tail, f"`{sub_name}` is still listed as store-backed only: {local!r}")
        fb = self.section("feedback")
        steps = {int(m.group(1)): fb[m.start():(nxt.start() if (nxt := re.compile(r"^\d+\. ", re.M).search(fb, m.end())) else len(fb))]
                 for m in re.finditer(r"^(\d+)\. ", fb, re.M)}
        for n in (2, 3, 6, 10):
            self.assertIn(n, steps, f"feedback has no step {n}")
            self.assertRegex(steps[n], r"[Rr]epo-local[^\n]{0,120}without\s+`--store`",
                             f"feedback step {n} does not run its pass/rounds call for repo-local changes without `--store`")
        for n in (2, 6):
            self.assertNotIn("(store-backed)", steps[n], f"feedback step {n} is still store-backed only")
        self.assertFalse(steps[10].startswith("10. Store-backed"), "feedback step 10 is still store-backed only")
        self.assertNotIn("repo-local the trailers in `git log", steps[3], "step 3 still reads repo-local rounds from git log by hand")

    def test_feedback_asks_before_adopting_a_foreign_record(self):
        fb = self.section("feedback")
        plan, adopt, done = (positions(sub("pass\\s+" + v), fb) for v in ("plan", "adopt", "done"))
        self.assertTrue(adopt, "the feedback section never runs `pr-pair.sh pass adopt`")
        w = positions(sub("pass\\s+write"), fb)[0]
        for name, at in (("plan", plan[0]), ("done", done[0]), ("adopt", adopt[0])):
            self.assertIn("--owner", fb[at:fb.index("`", at)], f"`pass {name}` is not given `--owner`")
        self.assertLess(plan[0], adopt[0], "`pass adopt` comes before `pass plan`")
        before = fb[plan[0]:adopt[0]]
        self.assertRegex(before, r"\bowned\b", "the text before `pass adopt` never reads `owned`")
        self.assertRegex(before, r"\bask", "the text before `pass adopt` never asks the user")
        self.assertRegex(before, r"\bgone\b", "the text before `pass adopt` never asks whether the owner is gone")
        self.assertIn("--from", fb[adopt[0]:fb.index("`", adopt[0])], "`pass adopt` is not given `--from`")
        self.assertRegex(fb, r"\bnot_owner\b")
        self.assertRegex(fb, r"\brecord_busy\b")
        self.assertRegex(fb, r"never remove a lock", "the lock rule is missing")
        self.assertRegex(fb[w:w + 700], r"owner", "the text after `pass write` never says to keep the owner id it returns")


if __name__ == "__main__":
    unittest.main()
