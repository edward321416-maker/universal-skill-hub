---
name: ush-quoted-desc
description: "Handles edge cases: colons, commas, and other punctuation in a quoted string."
metadata:
  type: global
  scope: global
  risk: L0
  status: EXPERIMENTAL
  version: 0.1.0
---

# Quoted YAML Fixture

This description is a quoted YAML scalar containing a colon — the old naive
line-based parser could not handle this correctly; a real YAML parser must.
