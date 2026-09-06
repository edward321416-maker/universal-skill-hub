import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderAdapter, ADAPTER_TARGETS } from '../render-adapters.mjs';

const CANONICAL = `---
name: ush-example-skill
description: A minimal valid fixture skill used only by validator tests.
metadata:
  type: global
  scope: global
  risk: L0
  status: EXPERIMENTAL
  version: 0.1.0
---

# Example Skill

Fixture body, not a real skill.
`;

test('Test G: adapter render for a supported platform embeds a DO NOT EDIT marker and the canonical body', () => {
  const rendered = renderAdapter({ skillId: 'ush-example-skill', canonicalBody: CANONICAL, platform: 'codex', capabilities: { requires: [], requires_not: [] } });
  assert.equal(rendered.blocked, false);
  assert.ok(rendered.content.includes('GENERATED — DO NOT EDIT'));
  assert.ok(rendered.content.includes('Fixture body, not a real skill.'));
  assert.equal(rendered.targetPath, ADAPTER_TARGETS.codex('ush-example-skill'));
});

test('Phase 1.2: codex/claude-code/cursor/opencode all declare shell_exec by default — a skill that needs shell access (e.g. running git/gh) is not blocked on any of them', () => {
  for (const platform of ['codex', 'claude-code', 'cursor', 'opencode']) {
    const rendered = renderAdapter({
      skillId: 'ush-example-skill',
      canonicalBody: CANONICAL,
      platform,
      capabilities: { requires: ['shell_exec'] },
    });
    assert.equal(rendered.blocked, false, `expected ${platform} to support shell_exec, got blocked: ${rendered.reason}`);
  }
});

test('Test G: adapter render BLOCKs when the skill requires a capability the platform cannot support', () => {
  const rendered = renderAdapter({
    skillId: 'ush-example-skill',
    canonicalBody: CANONICAL,
    platform: 'chatgpt',
    capabilities: { requires: ['native_skill_deployment'], requires_not: [] },
    platformCapabilities: { chatgpt: ['instruction_export'] },
  });
  assert.equal(rendered.blocked, true);
  assert.ok(rendered.reason.includes('native_skill_deployment'));
});
