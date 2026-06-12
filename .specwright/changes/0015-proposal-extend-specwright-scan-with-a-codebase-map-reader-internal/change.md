# Change

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

- ID: 0015
- Title: # Proposal: Extend `specwright scan` with a Codebase Map ## Reader Internal
- Kind: feature
- Mode: lite
- Pack: core
- Created: 2026-06-12T18:06:12.831Z

## Summary

`specwright scan` now preserves map-only scope, emits machine-readable JSON when requested, and prepares refresh prompts without prematurely persisting fresh fingerprints. Index validation now catches unsafe paths, malformed fingerprints, and directory/non-file references before refresh traversal.
