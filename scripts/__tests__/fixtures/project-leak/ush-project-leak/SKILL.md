---
name: ush-project-leak
description: Fixture that declares global scope while also binding to a specific project.
metadata:
  type: global
  scope: global
  project: one-rope
  risk: L0
  status: EXPERIMENTAL
  version: 0.1.0
---

# Project Leak Fixture

This should be rejected because a skill cannot be both global scope and bound to one project.
