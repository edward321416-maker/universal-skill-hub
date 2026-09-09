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

// Phase 1.3 live Codex validation: a real `codex exec` run against all six
// installed Hub skills failed every one with "failed to load skill ...:
// missing YAML frontmatter delimited by ---". Codex's real skill loader
// requires the file to start with the `---` delimiter as its literal first
// bytes; the GENERATED marker used to be prepended BEFORE the frontmatter
// (marker, blank line, then `---`), which Codex's parser rejects outright.
// Claude Code's own harness tolerated the old ordering (confirmed live in
// this session), so this was never caught until Codex was actually tested.
test('Phase 1.3: rendered adapter content begins with the frontmatter delimiter "---" as its literal first bytes, not the GENERATED marker — required for Codex\'s real skill loader to accept the file at all', () => {
  const rendered = renderAdapter({ skillId: 'ush-example-skill', canonicalBody: CANONICAL, platform: 'codex', capabilities: { requires: [], requires_not: [] } });
  assert.equal(rendered.blocked, false);
  assert.ok(rendered.content.startsWith('---\n'), `expected content to start with "---\\n", got: ${JSON.stringify(rendered.content.slice(0, 40))}`);
});

test('Phase 1.3: the GENERATED marker still appears in the rendered content (right after the frontmatter block), so provenance/drift detection is unaffected by the reordering', () => {
  const rendered = renderAdapter({ skillId: 'ush-example-skill', canonicalBody: CANONICAL, platform: 'codex', capabilities: { requires: [], requires_not: [] } });
  assert.ok(rendered.content.includes('GENERATED — DO NOT EDIT'));
  assert.ok(rendered.content.includes('Fixture body, not a real skill.'));
  // Frontmatter block must appear in full, byte-for-byte, before the marker.
  const frontmatterBlock = CANONICAL.slice(0, CANONICAL.indexOf('---', 3) + 3);
  assert.ok(rendered.content.startsWith(frontmatterBlock));
  assert.ok(rendered.content.indexOf('GENERATED') > rendered.content.indexOf(frontmatterBlock) + frontmatterBlock.length - 10);
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
