---
name: ush-bad-metadata-nested
description: Fixture with a nested object under metadata, which the spec disallows (metadata must be a flat string-to-string map).
metadata:
  scope: global
  risk: L0
  status: EXPERIMENTAL
  version: 0.1.0
  nested:
    list:
      - value
---

# Bad Metadata Fixture (nested)
