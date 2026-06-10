# Decisions

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Settled

- Scope includes all listed candidates: lifecycle routing enforcement, structured tools, OMP prompt adapter split, richer status/drift UI, and adapter version marker.
- Lifecycle routing should fail closed when OMP supports blocking `tool_call` interception.
- Status/drift surfacing should run validation from status refresh only with artifact-mtime caching.


## Deferred

- Structured tool return schema is deferred to research; current direction is a strong candidate, not a settled contract.
- Exact validation cache key and invalidation details are deferred to research.


## Ready state

- Ready for research once checkpoint verification records these discussion artifacts.

