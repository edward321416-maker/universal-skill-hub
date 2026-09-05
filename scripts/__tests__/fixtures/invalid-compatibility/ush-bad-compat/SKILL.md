---
name: ush-bad-compat
description: Fixture with a malformed optional compatibility block (wrong type).
metadata:
  type: global
  scope: global
  risk: L0
  status: EXPERIMENTAL
  version: 0.1.0
compatibility:
  requires: "read_files"
---

# Bad Compatibility Fixture

The `requires` field must be an array of strings, not a bare string.
