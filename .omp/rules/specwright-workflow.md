---
description: Keep Specwright artifacts current when working inside a Specwright project.
globs:
  - "**/*"
alwaysApply: true
---

When `.specwright/` exists, treat its files as source-of-truth workflow artifacts. Do not claim a Specwright change is planned, implemented, verified, or handed off unless the matching `.specwright/changes/<id>-<slug>/` artifact was updated or intentionally left unchanged with evidence.
