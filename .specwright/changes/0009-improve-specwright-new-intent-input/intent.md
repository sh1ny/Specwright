# Intent

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">
## Goal

Make `specwright new` accept an implementation request as the source intent instead of requiring a short human-authored title. The command must support longer inline text, `@file` references, model-generated change titles derived from the request, and remove the current explicit title input contract.

## Users

- Maintainers and agents creating Specwright changes from natural-language task descriptions.
- OMP users invoking `/specwright new` with enough context for the lifecycle to start without manual artifact editing.

## Non-goals

- Do not change downstream lifecycle commands (`discuss`, `research`, `plan`, `tasks`, `execute`) except where their usage/help text needs to reflect the new `new` contract.

</frozen-after-approval>

## Approval notes

### Source request

Make `specwright new` accept an implementation request as the source intent instead of requiring a short human-authored title. The command must support longer inline text, `@file` references, request-derived change titles, and remove the current explicit title input contract.

### Settled interpretation

- Input contract: `specwright new <kind> <request...>` with local `@file` expansion.
- Title behavior: derive title/slug deterministically from the request in this change; leave a seam for later model refinement, but do not require model availability.
- Artifact behavior: preserve the raw assembled request in `intent.md` for discuss/research evidence.