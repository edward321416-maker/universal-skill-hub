---
name: ush-nested-ok
description: Fixture with metadata deeper than one level of nesting, and a list value.
metadata:
  type: global
  scope: global
  risk: L0
  status: EXPERIMENTAL
  version: 0.1.0
  compatibility:
    requires:
      - read_files
      - search_symbols
    requires_not:
      - shell_exec
---

# Nested Metadata Fixture
