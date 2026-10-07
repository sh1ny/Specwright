# Writing the PR title and description

The diff is already on GitHub. The description explains what the diff cannot show: why, what was decided and rejected, what to look at, how it was verified. Cut any sentence a reader could reconstruct from the diff.

**Title:** imperative, under 72 characters, names the outcome ("Fix double-submit on checkout", not "Update checkout.rb"). Match the repo's convention (check `git log`). Never mark a change breaking (`!`, `BREAKING CHANGE:`) without the user's confirmation.

**Size by decision cost, not diff size:**

| Change | Body |
|---|---|
| Small and obvious | 1-2 sentences, under ~300 characters |
| Small but non-obvious | 3-5 sentences: why, the key decision, how verified |
| Large or risky | Sections below, ~100 lines at most |

**Opening:** one or two sentences carrying one idea - what changes for the user or system, and why now.

**For an OpenSpec change:** link the change (`openspec/changes/<name>/` or its archive path) instead of restating the proposal. Pull the "why" from proposal.md and the key decisions (with rejected alternatives) from design.md.

**Sections for large changes** (omit any that would be empty):
- Why
- What changed (grouped by area, not by file)
- Decisions and trade-offs (what was rejected and why)
- Risk and rollback
- Verification (commands run and results; a test map summary if there is one)
- Review focus (where a reviewer should look hardest)

**References:** `Fixes #N` only when the PR fully resolves issue N; otherwise `Related: #N`. Never invent issue numbers.

**Evidence:** label test output as test output. Screenshots only for visible UI changes.

**Templates:** if the repo has a PR template, it is the minimum structure and wins on conflict.

**Audit before posting:** (1) Does every sentence say something the diff does not? (2) Is the length proportional to the decisions a reviewer must make? (3) Are all claims (tests run, issues fixed) true?
