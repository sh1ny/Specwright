# Decisions

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

## Settled

- Build on the existing `.specwright/config.json` file and typed `SpecwrightConfig` model.
- Config access/mutation should be deterministic CLI behavior.
- Invalid updates should fail without corrupting the existing config.

## Deferred

- Plugin/extension config namespaces are deferred.
- Arbitrary custom keys are deferred.
- Comment-preserving config formats are deferred.

## Ready state

Ready for research.

