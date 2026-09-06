import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { partitionBundleEligibility } from '../bundle-skill.mjs';

// bundle_targets is a distinct, separate model from `platforms` (which
// describes runtime CLI/IDE agent support: codex, claude-code, cursor,
// opencode). `platforms` says nothing about whether a skill can be
// packaged as a claude.ai or OpenAI API Skill bundle — those are their own
// product surfaces with their own runtime constraints, tracked under
// `bundle_targets` with an explicit SUPPORTED/SUPPORTED_WITH_RESTRICTIONS/
// UNSUPPORTED status and a machine-readable reason.
const registry = {
  skills: [
    {
      skill_id: 'ush-a',
      platforms: ['codex', 'claude-code'],
      bundle_targets: {
        'claude-ai': { status: 'SUPPORTED', reason: 'pure text reasoning over supplied evidence' },
        'openai-api': { status: 'SUPPORTED_WITH_RESTRICTIONS', reason: 'works, but degrades without live repo access', requires_at_runtime: ['repository_evidence'] },
      },
    },
    {
      skill_id: 'ush-b',
      platforms: ['codex', 'claude-code'],
      bundle_targets: {
        'claude-ai': { status: 'UNSUPPORTED', reason: 'requires a live GitHub-write-capable network connection' },
        'openai-api': { status: 'UNSUPPORTED', reason: 'no verified GitHub-write capability in the documentation consulted' },
      },
    },
    {
      skill_id: 'ush-c-no-bundle-targets-declared',
      platforms: ['codex', 'claude-code'],
      // no bundle_targets at all — must fail closed as ineligible, not be
      // silently treated as compatible with every surface.
    },
  ],
};

test('partitionBundleEligibility: a skill with bundle_targets[target].status SUPPORTED is eligible', () => {
  const { eligible } = partitionBundleEligibility(registry, 'claude-ai');
  assert.ok(eligible.some((s) => s.skill_id === 'ush-a'));
});

test('partitionBundleEligibility: a skill with bundle_targets[target].status SUPPORTED_WITH_RESTRICTIONS is still eligible (packaging is not the same as guaranteeing every invocation succeeds)', () => {
  const { eligible } = partitionBundleEligibility(registry, 'openai-api');
  assert.ok(eligible.some((s) => s.skill_id === 'ush-a'));
});

test('partitionBundleEligibility: a skill with bundle_targets[target].status UNSUPPORTED is reported as ineligible with its reason, not silently dropped', () => {
  const { ineligible } = partitionBundleEligibility(registry, 'claude-ai');
  const entry = ineligible.find((s) => s.skill_id === 'ush-b');
  assert.ok(entry, 'expected ush-b to appear in the ineligible list');
  assert.ok(entry.reason.includes('GitHub-write'));
});

test('partitionBundleEligibility: a skill with no bundle_targets declared at all fails closed as ineligible (never assumed compatible)', () => {
  const { eligible, ineligible } = partitionBundleEligibility(registry, 'claude-ai');
  assert.ok(!eligible.some((s) => s.skill_id === 'ush-c-no-bundle-targets-declared'));
  assert.ok(ineligible.some((s) => s.skill_id === 'ush-c-no-bundle-targets-declared'));
});

test('partitionBundleEligibility: runtime `platforms` (codex/claude-code/...) has no bearing on bundle-target eligibility — both ush-a and ush-b share the exact same platforms list but differ in bundle eligibility', () => {
  const { eligible: claudeAiEligible } = partitionBundleEligibility(registry, 'claude-ai');
  const ids = claudeAiEligible.map((s) => s.skill_id);
  assert.ok(ids.includes('ush-a'));
  assert.ok(!ids.includes('ush-b'));
});

// --- Phase 1.2 review round 2, against the REAL registry ---

const realRegistry = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'registry', 'skills-index.json'), 'utf8'));

test('the real OpenAI bundle target is keyed as "openai-api", not "chatgpt" — ush-github-task-flow (UNSUPPORTED for openai-api) proves this: if the bundler were still keyed off "chatgpt" (a platform value this skill never lists), it would silently pass through', () => {
  const { eligible, ineligible } = partitionBundleEligibility(realRegistry, 'openai-api');
  assert.ok(!eligible.some((s) => s.skill_id === 'ush-github-task-flow'), 'ush-github-task-flow must be excluded under the openai-api target');
  const entry = ineligible.find((e) => e.skill_id === 'ush-github-task-flow');
  assert.ok(entry, 'ush-github-task-flow must appear in the ineligible list with a reason');
  assert.ok(entry.reason.length > 0);
});

test('ush-game-meeting-plan is bundle-eligible for claude-ai (re-evaluated per-skill, not blanket-excluded)', () => {
  const { eligible } = partitionBundleEligibility(realRegistry, 'claude-ai');
  assert.ok(eligible.some((s) => s.skill_id === 'ush-game-meeting-plan'));
});

test('ush-game-meeting-plan is bundle-eligible for openai-api (re-evaluated per-skill, not blanket-excluded)', () => {
  const { eligible } = partitionBundleEligibility(realRegistry, 'openai-api');
  assert.ok(eligible.some((s) => s.skill_id === 'ush-game-meeting-plan'));
});

test('every UNSUPPORTED bundle_targets entry in the real registry carries an explicit, non-empty reason', () => {
  for (const skill of realRegistry.skills) {
    for (const [target, entry] of Object.entries(skill.bundle_targets || {})) {
      if (entry.status === 'UNSUPPORTED') {
        assert.ok(entry.reason && entry.reason.length > 0, `${skill.skill_id}/${target} UNSUPPORTED entry must have a reason`);
      }
    }
  }
});
