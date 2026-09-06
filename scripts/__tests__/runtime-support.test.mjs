import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { checkConsistency } from '../registry-consistency.mjs';
import { isKnownRequirement, isKnownVocabId, RUNTIME_REQUIREMENTS } from '../runtime-vocabulary.mjs';

// Phase 1.2 review round 4: `runtime_support` (authoritative live-execution
// compatibility) + `platforms` (backward-compatible mirror) +
// `runtime_exclusions` (sparse, evidence-backed negative/unverified
// assessment) + a central runtime-requirements vocabulary for typed
// `requires_at_runtime` entries and existing required_capabilities/
// required_permissions/required_tools/operationGates fields.
// See docs/DESIGN.md's "Runtime compatibility model (Phase 1.2 review
// round 4)" section for the full definitions this locks in.

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

function withRuntime({ platforms, runtime_support, runtime_exclusions }) {
  return { ...baseEntry, platforms, runtime_support, runtime_exclusions };
}

// --- statuses ---

test('runtime_support status SUPPORTED is accepted', () => {
  const entry = withRuntime({
    platforms: ['codex'],
    runtime_support: { codex: { status: 'SUPPORTED', reason: 'r', evidence: validEvidence } },
  });
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, true, JSON.stringify(result.errors));
});

test('runtime_support status SUPPORTED_WITH_RESTRICTIONS is accepted', () => {
  const entry = withRuntime({
    platforms: ['codex'],
    runtime_support: {
      codex: {
        status: 'SUPPORTED_WITH_RESTRICTIONS',
        reason: 'r',
        evidence: validEvidence,
        requires_at_runtime: [{ kind: 'capability', id: 'github_write' }],
      },
    },
  });
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, true, JSON.stringify(result.errors));
});

test('runtime_support status UNSUPPORTED is rejected (must go in runtime_exclusions instead)', () => {
  const entry = withRuntime({
    platforms: ['codex'],
    runtime_support: { codex: { status: 'UNSUPPORTED', reason: 'r', evidence: validEvidence } },
  });
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('runtime_support') && e.includes('UNSUPPORTED')));
});

test('runtime_support status UNVERIFIED is rejected (must go in runtime_exclusions instead)', () => {
  const entry = withRuntime({
    platforms: ['codex'],
    runtime_support: { codex: { status: 'UNVERIFIED', reason: 'r', evidence: validEvidence } },
  });
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('runtime_support') && e.includes('UNVERIFIED')));
});

test('runtime_support entry with no reason is rejected', () => {
  const entry = withRuntime({
    platforms: ['codex'],
    runtime_support: { codex: { status: 'SUPPORTED', evidence: validEvidence } },
  });
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('reason')));
});

// --- mirror invariant ---

test('platforms == runtime_support keys (same set, different order) passes', () => {
  const entry = withRuntime({
    platforms: ['claude-code', 'codex'],
    runtime_support: {
      codex: { status: 'SUPPORTED', reason: 'r', evidence: validEvidence },
      'claude-code': { status: 'SUPPORTED', reason: 'r', evidence: validEvidence },
    },
  });
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, true, JSON.stringify(result.errors));
});

test('a platform missing its runtime_support key is FAIL', () => {
  const entry = withRuntime({
    platforms: ['codex', 'claude-code'],
    runtime_support: { codex: { status: 'SUPPORTED', reason: 'r', evidence: validEvidence } },
  });
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('claude-code')));
});

test('a runtime_support key missing from platforms is FAIL', () => {
  const entry = withRuntime({
    platforms: ['codex'],
    runtime_support: {
      codex: { status: 'SUPPORTED', reason: 'r', evidence: validEvidence },
      'claude-code': { status: 'SUPPORTED', reason: 'r', evidence: validEvidence },
    },
  });
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('claude-code')));
});

// --- runtime_exclusions ---

test('runtime_exclusions status UNSUPPORTED is accepted', () => {
  const entry = withRuntime({
    platforms: [],
    runtime_support: {},
    runtime_exclusions: { cursor: { status: 'UNSUPPORTED', reason: 'r', evidence: validEvidence } },
  });
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, true, JSON.stringify(result.errors));
});

test('runtime_exclusions status UNVERIFIED is accepted', () => {
  const entry = withRuntime({
    platforms: [],
    runtime_support: {},
    runtime_exclusions: { chatgpt: { status: 'UNVERIFIED', reason: 'r', evidence: validEvidence } },
  });
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, true, JSON.stringify(result.errors));
});

test('runtime_exclusions status SUPPORTED is rejected (must go in runtime_support instead)', () => {
  const entry = withRuntime({
    platforms: [],
    runtime_support: {},
    runtime_exclusions: { cursor: { status: 'SUPPORTED', reason: 'r', evidence: validEvidence } },
  });
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('runtime_exclusions') && e.includes('SUPPORTED')));
});

test('the same runtime key present in both runtime_support and runtime_exclusions is FAIL — cannot be simultaneously supported and excluded', () => {
  const entry = withRuntime({
    platforms: ['codex'],
    runtime_support: { codex: { status: 'SUPPORTED', reason: 'r', evidence: validEvidence } },
    runtime_exclusions: { codex: { status: 'UNVERIFIED', reason: 'r', evidence: validEvidence } },
  });
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('codex') && (e.includes('overlap') || e.includes('both'))));
});

test('a runtime never assessed (absent from both runtime_support and runtime_exclusions) is fine — sparse exclusions are opt-in, not exhaustive', () => {
  const entry = withRuntime({
    platforms: ['codex'],
    runtime_support: { codex: { status: 'SUPPORTED', reason: 'r', evidence: validEvidence } },
    runtime_exclusions: {},
  });
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, true, JSON.stringify(result.errors));
});

// --- typed requires_at_runtime ---

test('a typed requirement with a valid capability ref passes', () => {
  const entry = withRuntime({
    platforms: ['codex'],
    runtime_support: {
      codex: {
        status: 'SUPPORTED_WITH_RESTRICTIONS',
        reason: 'r',
        evidence: validEvidence,
        requires_at_runtime: [{ kind: 'capability', id: 'github_write' }],
      },
    },
  });
  assert.equal(checkConsistency({ registryEntry: entry, canonicalContent }).consistent, true);
});

test('a typed requirement with a valid permission ref passes', () => {
  const entry = withRuntime({
    platforms: ['codex'],
    runtime_support: {
      codex: {
        status: 'SUPPORTED_WITH_RESTRICTIONS',
        reason: 'r',
        evidence: validEvidence,
        requires_at_runtime: [{ kind: 'permission', id: 'github_merge' }],
      },
    },
  });
  assert.equal(checkConsistency({ registryEntry: entry, canonicalContent }).consistent, true);
});

test('a typed requirement with a valid tool ref passes', () => {
  const entry = withRuntime({
    platforms: ['codex'],
    runtime_support: {
      codex: {
        status: 'SUPPORTED_WITH_RESTRICTIONS',
        reason: 'r',
        evidence: validEvidence,
        requires_at_runtime: [{ kind: 'tool', id: 'git_diff_read' }],
      },
    },
  });
  assert.equal(checkConsistency({ registryEntry: entry, canonicalContent }).consistent, true);
});

test('a typed requirement with an unknown kind is FAIL', () => {
  const entry = withRuntime({
    platforms: ['codex'],
    runtime_support: {
      codex: {
        status: 'SUPPORTED_WITH_RESTRICTIONS',
        reason: 'r',
        evidence: validEvidence,
        requires_at_runtime: [{ kind: 'scope', id: 'github_write' }],
      },
    },
  });
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('kind')));
});

test('a typed requirement with an unknown vocabulary id is FAIL', () => {
  const entry = withRuntime({
    platforms: ['codex'],
    runtime_support: {
      codex: {
        status: 'SUPPORTED_WITH_RESTRICTIONS',
        reason: 'r',
        evidence: validEvidence,
        requires_at_runtime: [{ kind: 'capability', id: 'github-write' }],
      },
    },
  });
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('github-write')));
});

test('a typed requirement registered under the wrong namespace is FAIL (github_merge is a permission, not a capability)', () => {
  const entry = withRuntime({
    platforms: ['codex'],
    runtime_support: {
      codex: {
        status: 'SUPPORTED_WITH_RESTRICTIONS',
        reason: 'r',
        evidence: validEvidence,
        requires_at_runtime: [{ kind: 'capability', id: 'github_merge' }],
      },
    },
  });
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('github_merge')));
});

test('a duplicate {kind,id} typed requirement is FAIL', () => {
  const entry = withRuntime({
    platforms: ['codex'],
    runtime_support: {
      codex: {
        status: 'SUPPORTED_WITH_RESTRICTIONS',
        reason: 'r',
        evidence: validEvidence,
        requires_at_runtime: [
          { kind: 'capability', id: 'github_write' },
          { kind: 'capability', id: 'github_write' },
        ],
      },
    },
  });
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('duplicate')));
});

// --- central vocabulary reused across existing fields ---

test('a required_capabilities typo is FAIL', () => {
  const entry = { ...baseEntry, platforms: ['codex'], required_capabilities: ['github_write_access'] };
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('github_write_access')));
});

test('a required_permissions typo is FAIL', () => {
  const entry = { ...baseEntry, platforms: ['codex'], required_permissions: ['github-write'] };
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('github-write')));
});

test('a required_tools typo is FAIL', () => {
  const entry = { ...baseEntry, platforms: ['codex'], required_tools: ['git_diff_reader'] };
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('git_diff_reader')));
});

test('an operationGates.requiredCapabilities typo is FAIL', () => {
  const entry = {
    ...baseEntry,
    platforms: ['codex'],
    operationGates: { merge: { requiredCapabilities: ['github_write_typo'] } },
  };
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('github_write_typo')));
});

test('an operationGates.requiredPermissions typo is FAIL', () => {
  const entry = {
    ...baseEntry,
    platforms: ['codex'],
    operationGates: { merge: { requiredPermissions: ['message-publish'] } },
  };
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('message-publish')));
});

// --- provenance ---

test('a runtime_support entry with no evidence is FAIL', () => {
  const entry = withRuntime({
    platforms: ['codex'],
    runtime_support: { codex: { status: 'SUPPORTED', reason: 'r' } },
  });
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('evidence')));
});

test('a runtime_exclusion entry with no evidence is FAIL', () => {
  const entry = withRuntime({
    platforms: [],
    runtime_support: {},
    runtime_exclusions: { cursor: { status: 'UNVERIFIED', reason: 'r' } },
  });
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('evidence')));
});

test('an invalid verified_on date is FAIL', () => {
  const entry = withRuntime({
    platforms: ['codex'],
    runtime_support: {
      codex: { status: 'SUPPORTED', reason: 'r', evidence: [{ source_type: 'official_docs', source: 's', verified_on: '09-06-2026' }] },
    },
  });
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('verified_on')));
});

test('an unknown evidence source_type is FAIL', () => {
  const entry = withRuntime({
    platforms: ['codex'],
    runtime_support: {
      codex: { status: 'SUPPORTED', reason: 'r', evidence: [{ source_type: 'vibes', source: 's', verified_on: '2026-09-06' }] },
    },
  });
  const result = checkConsistency({ registryEntry: entry, canonicalContent });
  assert.equal(result.consistent, false);
  assert.ok(result.errors.some((e) => e.includes('source_type')));
});

test('a valid minimum evidence entry passes', () => {
  const entry = withRuntime({
    platforms: ['codex'],
    runtime_support: {
      codex: { status: 'SUPPORTED', reason: 'r', evidence: [{ source_type: 'local_runtime_test', source: 's', verified_on: '2026-09-06' }] },
    },
  });
  assert.equal(checkConsistency({ registryEntry: entry, canonicalContent }).consistent, true);
});

// --- runtime-vocabulary.mjs itself ---

test('runtime-vocabulary: known capability/permission/tool refs resolve true', () => {
  assert.equal(isKnownRequirement('capability', 'github_write'), true);
  assert.equal(isKnownRequirement('permission', 'github_merge'), true);
  assert.equal(isKnownRequirement('tool', 'git_diff_read'), true);
});

test('runtime-vocabulary: unknown refs resolve false, including cross-namespace lookups', () => {
  assert.equal(isKnownRequirement('capability', 'github_merge'), false); // permission, not capability
  assert.equal(isKnownRequirement('permission', 'git_diff_read'), false); // tool, not permission
  assert.equal(isKnownRequirement('bogus', 'github_write'), false);
  assert.equal(isKnownVocabId('capabilities', 'nonexistent'), false);
});

// --- real registry: every one of the six real entries passes the new validation ---

const realRegistry = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'registry', 'skills-index.json'), 'utf8'));

test('every real registry entry passes checkConsistency under the new runtime_support/runtime_exclusions model', () => {
  for (const skill of realRegistry.skills) {
    const realCanonical = fs.readFileSync(path.join(skill.path, 'SKILL.md'), 'utf8');
    const result = checkConsistency({ registryEntry: skill, canonicalContent: realCanonical });
    assert.equal(result.consistent, true, `${skill.skill_id}: ${JSON.stringify(result.errors)}`);
  }
});

test('every real registry entry declares runtime_support (Round 4 requires all six to be re-evaluated)', () => {
  for (const skill of realRegistry.skills) {
    assert.ok(skill.runtime_support && Object.keys(skill.runtime_support).length > 0, `${skill.skill_id} is missing runtime_support`);
  }
});

test('RUNTIME_REQUIREMENTS vocabulary covers only identifiers actually used somewhere in the real registry (no speculative entries)', () => {
  const usedCapabilities = new Set();
  const usedPermissions = new Set();
  const usedTools = new Set();
  for (const skill of realRegistry.skills) {
    for (const c of skill.required_capabilities || []) usedCapabilities.add(c);
    for (const p of skill.required_permissions || []) usedPermissions.add(p);
    for (const t of skill.required_tools || []) usedTools.add(t);
    for (const gate of Object.values(skill.operationGates || {})) {
      for (const c of gate.requiredCapabilities || []) usedCapabilities.add(c);
      for (const p of gate.requiredPermissions || []) usedPermissions.add(p);
    }
    for (const entry of Object.values(skill.runtime_support || {})) {
      for (const req of entry.requires_at_runtime || []) {
        if (req.kind === 'capability') usedCapabilities.add(req.id);
        if (req.kind === 'permission') usedPermissions.add(req.id);
        if (req.kind === 'tool') usedTools.add(req.id);
      }
    }
  }
  for (const id of Object.keys(RUNTIME_REQUIREMENTS.capabilities)) {
    assert.ok(usedCapabilities.has(id), `capability "${id}" is declared in the vocabulary but never actually used in the registry`);
  }
  for (const id of Object.keys(RUNTIME_REQUIREMENTS.permissions)) {
    assert.ok(usedPermissions.has(id), `permission "${id}" is declared in the vocabulary but never actually used in the registry`);
  }
  for (const id of Object.keys(RUNTIME_REQUIREMENTS.tools)) {
    assert.ok(usedTools.has(id), `tool "${id}" is declared in the vocabulary but never actually used in the registry`);
  }
});
