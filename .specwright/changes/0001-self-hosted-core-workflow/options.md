# Options

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Option 1

Continue with the current clean-cut implementation as the baseline.

- Pros: already implemented, tested, dogfooded, and aligned with the intended kernel-not-framework-sprawl direction.
- Cons: some command edge cases and OMP load behavior are only lightly tested; intent/constraints are still empty, so planning cannot be validated as complete.
- Best when: the goal is to start using Specwright immediately and improve it through dogfood tasks.

## Option 2

Pause feature work and harden the current kernel before using it for more changes.

- Pros: can add more negative tests around argument parsing, pack validation, state migration/merge behavior, and OMP extension loading before relying on it heavily.
- Cons: delays using the tool for real work and risks overfitting tests before actual workflow friction is known.
- Best when: this repository must support external users immediately.

## Recommendation

Use Option 1 with narrow hardening tasks discovered through dogfooding. First fill `intent.md` and `constraints.md`, then plan small tasks that preserve the current architecture: deterministic CLI core, file artifacts, local packs, and OMP-only runtime adapter.

