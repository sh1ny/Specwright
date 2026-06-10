# Constraints

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Product constraints

- Change 0011 includes all listed OMP integration candidates unless research proves an OMP API assumption false.
- Lifecycle routing must improve weak-model behavior; prompt-only routing is not an acceptable final outcome for this change.


## Technical constraints

- Existing frozen intent content must remain intact unless explicitly renegotiated.
- The OMP adapter API surface must be confirmed before implementation widens `ExtensionApiLike` beyond the currently observed command/event/UI methods.
- Blocking lifecycle enforcement may depend on OMP `tool_call` interception support; if unsupported, research must surface that as a plan blocker or force a scope decision.
- Structured Specwright tools must not introduce an unverified second public result schema; their return contract is research-gated.
- Status validation must be cached by relevant artifact mtime when status/drift UI is implemented.


## Open constraints

- Exact structured tool return shape: mirror `CommandResult` or define typed per-tool reports after OMP API research.
- Exact cache key for status validation: likely `plan.md`, `tasks.md`, and verification inputs, to be confirmed during research.

