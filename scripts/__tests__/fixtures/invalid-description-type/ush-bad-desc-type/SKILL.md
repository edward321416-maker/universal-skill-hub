---
name: ush-bad-desc-type
description: 123
metadata:
  scope: global
  risk: L0
  status: EXPERIMENTAL
  version: 0.1.0
---

# Bad Description Type Fixture

The `description` field must be a string per the Agent Skills spec, even
though it happens to coerce to a length-valid value via String(123).
