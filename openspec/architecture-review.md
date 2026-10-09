# Review

## Metadata

- **Round:** 4
- **Prior round:** round 3 APPROVE_WITH_CHANGES at 8fe137d, changes applied and re-checked in 9d472f8; since then PR fix rounds 12–13 edited the files.
- **Reviewer:** cross-model CLI (codex)
- **Reviewed:** Clean checkout at `43ed3e8564c7535a4df9bfc767d012e4e5679d59`: complete `openspec/strategy.md`, `openspec/architecture.md`, `openspec/roadmap.md`, prior `openspec/architecture-review.md`; complete ADRs `0001`–`0006`; all six `skills/*/SKILL.md`; all four `skills/specwright-pr/scripts/*.sh`; both PR references and all three roadmap references; `schemas/specwright/schema.yaml` and its five artifact templates; all four agent definitions; both configuration templates; `README.md`; `CONTRIBUTING.md`; `evals/pr-pair/test_skill_text.py`, `test_as_sh.py`, `test_fake_gh.py`, selected sections of `test_pr_pair.py`, `evals/fakes/gh.py`, `evals/git-workflow/evals.json`, `fixtures.py`, and `grade.py`; baseline diff from `8fe137d`. Verification included synthetic credential probes and five passing read-only skill-text tests. No files were modified.

## Findings

### Critical (blocking)

None.

### Moderate

**M1 — Credentials embedded in a supported remote URL bypass the claimed git identity fence.**

ADR 0004 says `as.sh` pins git’s HTTPS credentials to the verified login and that pushes use the pinned token (`docs/adr/0004-process-scoped-github-identity.md:11`, `:21`). The component graph now labels its git edge “fenced push” (`openspec/architecture.md:41`). The documented exceptions at `openspec/architecture.md:92` omit credentials supplied in the remote URL.

The implementation sets a credential helper (`skills/specwright-pr/scripts/as.sh:56–58`) but does not reject or override URL credentials. The repository parser accepts HTTPS URLs containing username/password (`skills/specwright-pr/scripts/pr-pair.sh:61–63`, `:347–362`); an existing test explicitly treats `https://x-access-token:tok@github.com/team/plans.git` as supported (`evals/pr-pair/test_pr_pair.py:209–215`).

A read-only probe ran the unmodified wrapper with mocked `gh` authentication and synthetic credentials. For a credential-free HTTPS URL, `git credential fill` returned the fence’s token. For an otherwise identical URL containing another username/password, it returned the URL credentials instead. An in-memory probe of the actual `identity()` function also accepted matching credential-bearing fetch and push URLs.

Consequently, when the embedded token belongs to another account, a push can authenticate as that account while subsequent `gh` operations use the configured, verified login. The wrapper’s identity verification succeeds and gives no indication of that mismatch. This is a configured-login escape, distinct from the recorded empty-login and unfenced-read exceptions.

### Suggestions

None.

## Verdict

VERDICT: APPROVE_WITH_CHANGES

The foundational decisions remain sound. Approval requires accurately documenting and tracking the additional transport exception; its runtime fix may remain scheduled.

## Required Changes

1. In ADR 0004, replace “pins git’s HTTPS credentials to it with SSH disabled” with “configures git’s HTTPS credential helper with the verified token and disables SSH.” Add this exception to the Decision section: “Credentials embedded in a remote URL currently bypass the helper, so a configured login does not guarantee the account used by git push (#38).” Replace the first Consequences bullet about transport with: “SSH is disabled; the credential helper supplies the pinned token only for HTTPS to github.com. Credentials embedded in a remote URL can take precedence (#38).”

2. In `openspec/architecture.md`, change the graph edge label `fenced push` to `push via as.sh`. Add the URL-credential exception to the GitHub identity contract and ADR 0004 index row. Expand the #38 Known gaps entry to include credential-bearing remote URLs bypassing `as.sh`, explicitly stating that a successful push can use another account without reporting the mismatch.

3. Extend tracking issue #38 and its existing M2 work in `openspec/roadmap.md` to cover this exception. Require regression cases for credential-free HTTPS URLs and credential-bearing fetch and push URLs, including multiple push URLs. Verification must establish that git receives the verified token or refuses publication; repository-slug parsing alone is insufficient.

4. Because ADR text must change, return ADRs `0001`–`0006` to `Status: proposed`, as required for this review cycle. Replace the architecture’s round-3 acceptance paragraph with: “The baseline ADRs are proposed pending the round 4 review of their revised final text; they are marked accepted only after that gate passes.”

CHANGES_APPLIED: yes

## Rebuttals

None submitted for round 4. Round 3’s required changes are present and accurately recorded; they are not reopened.

Author, after round 4:
- **Required change 1:** applied. ADR 0004's Decision says `as.sh` configures git's HTTPS credential helper with the verified token and disables SSH, and records that credentials embedded in a remote URL bypass the helper (#38); the transport Consequence is replaced with the given text.
- **Required change 2:** applied. The graph edge reads `push via as.sh`; the GitHub identity contract, the ADR 0004 index row and the #38 Known gaps entry name credential-bearing remote URLs, and the gaps entry says a successful push can use another account without reporting the mismatch.
- **Required change 3:** applied. #38 has a comment describing the exception and the required regression cases (credential-free HTTPS, credential-bearing fetch and push URLs, several push URLs; git must receive the verified token or refuse to publish). The roadmap's M2 paragraph adds the exception and those cases to #38's work.
- **Required change 4:** applied. ADRs 0001-0006 are `Status: proposed`, and the architecture's acceptance paragraph is replaced with the given text.

Reviewer re-check:

- **Required change 1:** accepted. ADR 0004 contains the revised helper wording, the required URL-credential exception and the transport consequence.
- **Required change 2:** accepted. The graph, identity contract, ADR index and #38 gap entry include the required wording and silent account-mismatch risk.
- **Required change 3:** accepted. M2 and the supplied #38 comment cover credential-free HTTPS, credential-bearing fetch and push URLs, multiple push URLs, and verified-token-or-refusal evidence rather than slug parsing alone. The configured gh credential was unavailable, so the supplied comment was used.
- **Required change 4:** accepted. All six ADRs are proposed, and the architecture contains the exact round-4 acceptance paragraph.