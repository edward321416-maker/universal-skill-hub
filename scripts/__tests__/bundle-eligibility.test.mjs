import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partitionBundleEligibility } from '../bundle-skill.mjs';

const registry = {
  skills: [
    { skill_id: 'ush-a', platforms: ['codex', 'claude-code', 'claude-ai'] },
    { skill_id: 'ush-b', platforms: ['codex', 'claude-code'] },
  ],
};

test('partitionBundleEligibility: a skill listing the target platform is eligible', () => {
  const { eligible, ineligible } = partitionBundleEligibility(registry, 'claude-ai');
  assert.deepEqual(eligible.map((s) => s.skill_id), ['ush-a']);
});

test('partitionBundleEligibility: a skill NOT listing the target platform is reported as ineligible, not silently dropped', () => {
  const { eligible, ineligible } = partitionBundleEligibility(registry, 'claude-ai');
  assert.deepEqual(ineligible.map((s) => s.skill_id), ['ush-b']);
});
