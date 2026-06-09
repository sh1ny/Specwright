# Change

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

- ID: 0009
- Title: Improve Specwright New Intent Input
- Kind: feature
- Mode: lite
- Pack: core
- Created: 2026-06-09T18:06:35.344Z

## Summary

Update `specwright new` so it creates a change from task intent, not a required title argument. The command should accept long inline text, load `@file` references, ask the configured model to derive the change title from that intent, and remove the current title-accepting behavior.