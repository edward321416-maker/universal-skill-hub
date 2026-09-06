import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { checkConsistency } from '../registry-consistency.mjs';

// PR #4 "FINAL REVIEW PATCH" (Phase 1.2 review round 4, final small patch):
// three blockers on the round-4 runtime compatibility model.
//   1. bundle_targets[*].requires_at_runtime must be typed-only, validated
//      by the exact same helper as runtime_support[*].requires_at_runtime
//      — no legacy raw-string carve-out.
//   2. runtime_support (and its platforms mirror) must be MANDATORY,
//      enforced by checkConsistency itself, not merely by a repo-level
//      test enumerating today's six entries.
//   3. requires_at_runtime must only describe requirements that apply to
//      the skill/runtime generally — an operation-specific requirement
//      (gated by operationGates) must not also be duplicated into
//      requires_at_runtime.

const canonicalContent = `---
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
`;

const contentHash = crypto.createHash('sha256').update(canonicalContent).digest('hex');

const baseEntry = {
  skill_id: 'ush-example-skill',
  version: '0.1.0',
  scope: 'global',
  risk: 'L0',
  status: 'EXPERIMENTAL',
  content_sha256: contentHash,
};

const validEvidence = [{ source_type: 'official_docs', source: 'Some primary-source documentation page.', verified_on: '2026-09-06' }];

function validEntry(overrides) {
  return {
    ...baseEntry,
    platforms: ['codex'],
    runtime_support: { codex: { status: 'SUPPORTED', reason: 'r', evidence: validEvidence } },
    ...overrides,
  };
}

// --- BLOCKER 1: typed-only bundle_targets.requires_at_runtime ---

test('BLOCKER 1: a bundle_targets.requires_at_runtime raw string entry is FAIL, not silently skipped', () => {
  const entry = validEntry({
    bundle_targets: {
      'claude-ai': { status: 'SUPPORTED', reason: 'x', requires_at_runtime: ['github_write'] },
      'openai-api': { status: 'SUPPORTED', reason: 'x' },
    },
  });
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('bundle_targets') && e.includes('typed') || e.includes('string')));
});

test('BLOCKER 1: a bundle_targets.requires_at_runtime with valid typed {kind,id} entries passes', () => {
  const entry = validEntry({
    bundle_targets: {
      'claude-ai': { status: 'SUPPORTED', reason: 'x', requires_at_runtime: [{ kind: 'capability', id: 'github_write' }] },
      'openai-api': { status: 'SUPPORTED', reason: 'x' },
    },
  });
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, true, JSON.stringify(result.errors));
});

test('BLOCKER 1: a bundle_targets.requires_at_runtime unknown kind is FAIL', () => {
  const entry = validEntry({
    bundle_targets: {
      'claude-ai': { status: 'SUPPORTED', reason: 'x', requires_at_runtime: [{ kind: 'scope', id: 'github_write' }] },
      'openai-api': { status: 'SUPPORTED', reason: 'x' },
    },
  });
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('kind')));
});

test('BLOCKER 1: a bundle_targets.requires_at_runtime unknown vocabulary id is FAIL', () => {
  const entry = validEntry({
    bundle_targets: {
      'claude-ai': { status: 'SUPPORTED', reason: 'x', requires_at_runtime: [{ kind: 'capability', id: 'github-write' }] },
      'openai-api': { status: 'SUPPORTED', reason: 'x' },
    },
  });
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('github-write')));
});

test('BLOCKER 1: a bundle_targets.requires_at_runtime entry registered under the wrong namespace is FAIL', () => {
  const entry = validEntry({
    bundle_targets: {
      'claude-ai': { status: 'SUPPORTED', reason: 'x', requires_at_runtime: [{ kind: 'capability', id: 'github_merge' }] },
      'openai-api': { status: 'SUPPORTED', reason: 'x' },
    },
  });
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('github_merge')));
});

test('BLOCKER 1: a duplicate {kind,id} in bundle_targets.requires_at_runtime is FAIL', () => {
  const entry = validEntry({
    bundle_targets: {
      'claude-ai': {
        status: 'SUPPORTED',
        reason: 'x',
        requires_at_runtime: [
          { kind: 'capability', id: 'github_write' },
          { kind: 'capability', id: 'github_write' },
        ],
      },
      'openai-api': { status: 'SUPPORTED', reason: 'x' },
    },
  });
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('duplicate')));
});

// --- BLOCKER 2: runtime_support (and platforms) are mandatory ---

test('BLOCKER 2: a registry entry with no runtime_support at all is FAIL', () => {
  const entry = { ...baseEntry, platforms: ['codex'] };
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('runtime_support')));
});

test('BLOCKER 2: a registry entry with no platforms at all is FAIL', () => {
  const entry = { ...baseEntry, runtime_support: { codex: { status: 'SUPPORTED', reason: 'r', evidence: validEvidence } } };
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('platforms')));
});

test('BLOCKER 2: a registry entry missing BOTH runtime_support and platforms is FAIL for both reasons', () => {
  const entry = { ...baseEntry };
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('runtime_support')));
  assert.ok(result.errors.some((e) => e.includes('platforms')));
});

test('BLOCKER 2: platforms and runtime_support declaring the same set passes', () => {
  const entry = validEntry({});
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, true, JSON.stringify(result.errors));
});

test('BLOCKER 2: a set mismatch between platforms and runtime_support (either direction) is FAIL', () => {
  const missingFromSupport = validEntry({ platforms: ['codex', 'claude-code'] });
  const r1 = checkConsistency({ registryEntry: missingFromSupport, canonicalContent });
  assert.equal(r1.consistent, false);
  assert.ok(r1.errors.some((e) => e.includes('claude-code')));

  const missingFromPlatforms = validEntry({
    platforms: ['codex'],
    runtime_support: {
      codex: { status: 'SUPPORTED', reason: 'r', evidence: validEvidence },
      'claude-code': { status: 'SUPPORTED', reason: 'r', evidence: validEvidence },
    },
  });
  const r2 = checkConsistency({ registryEntry: missingFromPlatforms, canonicalContent });
  assert.equal(r2.consistent, false);
  assert.ok(r2.errors.some((e) => e.includes('claude-code')));
});

test('BLOCKER 2: every real registry entry declares both runtime_support and platforms (checked by checkConsistency itself, not merely a repo-level enumeration test)', () => {
  const realRegistry = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'registry', 'skills-index.json'), 'utf8'));
  for (const skill of realRegistry.skills) {
    const realCanonical = fs.readFileSync(path.join(skill.path, 'SKILL.md'), 'utf8');
    const result = checkConsistency({ registryEntry: skill, canonicalContent: realCanonical });
    assert.equal(result.consistent, true, `${skill.skill_id}: ${JSON.stringify(result.errors)}`);
    assert.ok(skill.runtime_support, `${skill.skill_id} missing runtime_support`);
    assert.ok(skill.platforms, `${skill.skill_id} missing platforms`);
  }
});

// --- BLOCKER 3: operation-specific requirements must not leak into runtime-level requires_at_runtime ---

const realRegistry = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'registry', 'skills-index.json'), 'utf8'));
function getRealSkill(id) {
  const skill = realRegistry.skills.find((s) => s.skill_id === id);
  assert.ok(skill, `expected registry entry for "${id}"`);
  return skill;
}

test('BLOCKER 3: ush-discord-repo-cross-reference — discord_send (capability/permission) is gated only by operationGates.send, never duplicated into runtime_support[*].requires_at_runtime', () => {
  const skill = getRealSkill('ush-discord-repo-cross-reference');
  for (const [platform, entry] of Object.entries(skill.runtime_support)) {
    const refs = entry.requires_at_runtime || [];
    assert.ok(
      !refs.some((r) => r.id === 'discord_send'),
      `runtime_support["${platform}"].requires_at_runtime must not list discord_send — the default analyze operation needs nothing; only the separately-gated send operation does`
    );
  }
  assert.deepEqual(skill.operationGates.send.requiredCapabilities, ['discord_send']);
  assert.deepEqual(skill.operationGates.send.requiredPermissions, ['discord_send']);
});

test('BLOCKER 3: ush-work-announcement — message_publish (capability/permission) is gated only by operationGates.publish, never duplicated into runtime_support[*].requires_at_runtime', () => {
  const skill = getRealSkill('ush-work-announcement');
  for (const [platform, entry] of Object.entries(skill.runtime_support)) {
    const refs = entry.requires_at_runtime || [];
    assert.ok(
      !refs.some((r) => r.id === 'message_publish'),
      `runtime_support["${platform}"].requires_at_runtime must not list message_publish — the default draft operation needs nothing; only the separately-gated publish operation does`
    );
  }
  assert.deepEqual(skill.operationGates.publish.requiredCapabilities, ['message_publish']);
  assert.deepEqual(skill.operationGates.publish.requiredPermissions, ['message_publish']);
});

test('BLOCKER 3: ush-work-announcement still requires repository_evidence generally at runtime (drafting itself needs it; this is NOT operation-gated, so it correctly stays in requires_at_runtime)', () => {
  const skill = getRealSkill('ush-work-announcement');
  for (const [platform, entry] of Object.entries(skill.runtime_support)) {
    const refs = entry.requires_at_runtime || [];
    assert.ok(refs.some((r) => r.id === 'repository_evidence'), `runtime_support["${platform}"] should still list repository_evidence`);
  }
});

test('BLOCKER 3: analogous bundle_targets entries for these two skills also drop the operation-specific refs from requires_at_runtime', () => {
  const discord = getRealSkill('ush-discord-repo-cross-reference');
  for (const [target, entry] of Object.entries(discord.bundle_targets)) {
    const refs = entry.requires_at_runtime || [];
    assert.ok(!refs.some((r) => r.id === 'discord_send'), `bundle_targets["${target}"] must not list discord_send as a general requirement`);
  }
  const announcement = getRealSkill('ush-work-announcement');
  for (const [target, entry] of Object.entries(announcement.bundle_targets)) {
    const refs = entry.requires_at_runtime || [];
    assert.ok(!refs.some((r) => r.id === 'message_publish'), `bundle_targets["${target}"] must not list message_publish as a general requirement`);
  }
});

test('BLOCKER 3: eligibility behavior preserved — discord analyze without send capability is still USE, send without it is still BLOCK (unaffected by registry data changes, since eligibility.mjs never reads runtime_support)', async () => {
  const { evaluateEligibility } = await import('../eligibility.mjs');
  const skill = getRealSkill('ush-discord-repo-cross-reference');
  const analyzeResult = evaluateEligibility({ skill, task: { platform: 'codex', autoInvoke: true, requestedOperations: ['analyze'] } });
  assert.equal(analyzeResult.decision, 'USE');
  const sendResult = evaluateEligibility({
    skill,
    task: { platform: 'codex', autoInvoke: false, requestedOperations: ['send'], explicitIntent: true, grantedPermissions: [], availableCapabilities: [] },
  });
  assert.equal(sendResult.decision, 'BLOCK');
});

test('BLOCKER 3: eligibility behavior preserved — work-announcement draft without publish capability is still USE, publish without it is still BLOCK', async () => {
  const { evaluateEligibility } = await import('../eligibility.mjs');
  const skill = getRealSkill('ush-work-announcement');
  const draftResult = evaluateEligibility({ skill, task: { platform: 'codex', autoInvoke: true, requestedOperations: ['draft'] } });
  assert.equal(draftResult.decision, 'USE');
  const publishResult = evaluateEligibility({
    skill,
    task: { platform: 'codex', autoInvoke: false, requestedOperations: ['publish'], explicitIntent: true, grantedPermissions: [], availableCapabilities: [] },
  });
  assert.equal(publishResult.decision, 'BLOCK');
});

// --- full real-registry pass under all three blockers fixed ---

test('every real registry entry passes checkConsistency after the final patch', () => {
  for (const skill of realRegistry.skills) {
    const realCanonical = fs.readFileSync(path.join(skill.path, 'SKILL.md'), 'utf8');
    const result = checkConsistency({ registryEntry: skill, canonicalContent: realCanonical });
    assert.equal(result.consistent, true, `${skill.skill_id}: ${JSON.stringify(result.errors)}`);
  }
});
