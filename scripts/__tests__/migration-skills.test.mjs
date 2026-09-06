import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluateEligibility } from '../eligibility.mjs';
import { isApprovalValid } from '../approval-gate.mjs';
import crypto from 'node:crypto';

function hashOf(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

const registry = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'registry', 'skills-index.json'), 'utf8'));
function getSkill(id) {
  const skill = registry.skills.find((s) => s.skill_id === id);
  assert.ok(skill, `expected registry entry for "${id}"`);
  return skill;
}

// --- ush-github-task-flow (Phase 1.2 migration) ---

test('ush-github-task-flow: no explicit intent is BLOCKed', () => {
  const skill = getSkill('ush-github-task-flow');
  const result = evaluateEligibility({
    skill,
    task: { platform: 'codex', autoInvoke: false, explicitIntent: false, hasPermission: true, availableCapabilities: ['github_write'], grantedPermissions: ['github_write'] },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'L3_NO_EXPLICIT_INTENT');
});

test('ush-github-task-flow: no GitHub write permission granted is BLOCKed', () => {
  const skill = getSkill('ush-github-task-flow');
  const result = evaluateEligibility({
    skill,
    task: { platform: 'codex', autoInvoke: false, explicitIntent: true, hasPermission: true, availableCapabilities: ['github_write'], grantedPermissions: [] },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'MISSING_PERMISSION');
});

test('ush-github-task-flow: REGRESSION — a host-level "allow all" permission grant does not substitute for an actual read-only GitHub provider; the provider having no write capability BLOCKs regardless of what the chat UI permission says', () => {
  const skill = getSkill('ush-github-task-flow');
  const result = evaluateEligibility({
    skill,
    task: {
      platform: 'codex',
      autoInvoke: false,
      explicitIntent: true,
      hasPermission: true, // the UI says "allow all"
      grantedPermissions: ['github_write'], // the UI granted write permission generically
      availableCapabilities: [], // but the actual GitHub provider for this task is read-only
    },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'MISSING_CAPABILITY');
});

test('ush-github-task-flow: explicit intent + real write capability + granted permission is USE (not auto-invoked, matching its EXPERIMENTAL L3 status)', () => {
  const skill = getSkill('ush-github-task-flow');
  const result = evaluateEligibility({
    skill,
    task: {
      platform: 'codex',
      autoInvoke: false,
      explicitIntent: true,
      hasPermission: true,
      grantedPermissions: ['github_write'],
      availableCapabilities: ['github_write'],
    },
  });
  assert.equal(result.decision, 'USE');
});

test('ush-github-task-flow: being EXPERIMENTAL, this skill cannot be auto-invoked for its L3 write path even with every capability present', () => {
  const skill = getSkill('ush-github-task-flow');
  const result = evaluateEligibility({
    skill,
    task: {
      platform: 'codex',
      autoInvoke: true,
      explicitIntent: true,
      hasPermission: true,
      grantedPermissions: ['github_write'],
      availableCapabilities: ['github_write'],
    },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'EXPERIMENTAL_L3_AUTO');
});

test('ush-github-task-flow: an unsupported platform (e.g. chatgpt, not a filesystem-adapter platform for this skill) is BLOCKed', () => {
  const skill = getSkill('ush-github-task-flow');
  const result = evaluateEligibility({
    skill,
    task: { platform: 'chatgpt', autoInvoke: false, explicitIntent: true, hasPermission: true, grantedPermissions: ['github_write'], availableCapabilities: ['github_write'] },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'PLATFORM_UNSUPPORTED');
});

// --- ush-github-task-flow: PR delivery does not imply merge (Phase 1.2 review round 2) ---

test('ush-github-task-flow: "implement issue #42 and open a PR" (default deliver_pr path, no merge requested) is USE without any merge-specific authorization', () => {
  const skill = getSkill('ush-github-task-flow');
  const result = evaluateEligibility({
    skill,
    task: {
      platform: 'codex',
      autoInvoke: false,
      requestedOperations: ['deliver_pr'],
      explicitIntent: true,
      hasPermission: true,
      grantedPermissions: ['github_write'],
      availableCapabilities: ['github_write'],
    },
  });
  assert.equal(result.decision, 'USE');
});

test('ush-github-task-flow: requesting "merge" without explicit merge intent is BLOCKed even with github_write present', () => {
  const skill = getSkill('ush-github-task-flow');
  const result = evaluateEligibility({
    skill,
    task: {
      platform: 'codex',
      autoInvoke: false,
      requestedOperations: ['merge'],
      explicitIntent: false,
      grantedPermissions: ['github_write', 'github_merge'],
      availableCapabilities: ['github_write'],
    },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'OPERATION_NO_EXPLICIT_INTENT');
});

test('ush-github-task-flow: requesting "merge" with explicit intent but without the named github_merge permission is BLOCKed — github_write alone does not authorize merging', () => {
  const skill = getSkill('ush-github-task-flow');
  const result = evaluateEligibility({
    skill,
    task: {
      platform: 'codex',
      autoInvoke: false,
      requestedOperations: ['merge'],
      explicitIntent: true,
      grantedPermissions: ['github_write'], // no github_merge
      availableCapabilities: ['github_write'],
    },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'OPERATION_MISSING_PERMISSION');
});

test('ush-github-task-flow: requesting "merge" with explicit intent, named github_merge permission, write capability, and the baseline L3 permission grant is USE', () => {
  const skill = getSkill('ush-github-task-flow');
  const result = evaluateEligibility({
    skill,
    task: {
      platform: 'codex',
      autoInvoke: false,
      requestedOperations: ['merge'],
      explicitIntent: true,
      hasPermission: true, // baseline L3 gate for this skill overall
      grantedPermissions: ['github_write', 'github_merge'],
      availableCapabilities: ['github_write'],
    },
  });
  assert.equal(result.decision, 'USE');
});

// --- ush-concurrent-edit-coordination (Phase 1.2 migration) ---

test('ush-concurrent-edit-coordination: eligible on a supported platform with real diff-inspection evidence available', () => {
  const skill = getSkill('ush-concurrent-edit-coordination');
  const result = evaluateEligibility({
    skill,
    task: { platform: 'codex', autoInvoke: true, availableTools: ['git_diff_read'] },
  });
  assert.equal(result.decision, 'USE');
});

test('ush-concurrent-edit-coordination: without actual diff-inspection capability, a safe non-execution result (BLOCK, not a guess) is returned instead of fabricating an overlap verdict', () => {
  const skill = getSkill('ush-concurrent-edit-coordination');
  const result = evaluateEligibility({
    skill,
    task: { platform: 'codex', autoInvoke: true },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'MISSING_TOOL');
});

test('ush-concurrent-edit-coordination: being L0, this skill IS eligible for automatic invocation (unlike the L3 github-task-flow skill) once evidence is available', () => {
  const skill = getSkill('ush-concurrent-edit-coordination');
  const result = evaluateEligibility({
    skill,
    task: { platform: 'claude-code', autoInvoke: true, availableTools: ['git_diff_read'] },
  });
  assert.equal(result.decision, 'USE');
});

// --- ush-game-meeting-plan (Phase 1.2 migration) ---

test('ush-game-meeting-plan: is USE — a read-only L0 domain skill, eligible even for automatic invocation', () => {
  const skill = getSkill('ush-game-meeting-plan');
  const result = evaluateEligibility({
    skill,
    task: { platform: 'codex', autoInvoke: true },
  });
  assert.equal(result.decision, 'USE');
});

test('ush-game-meeting-plan and ush-repo-evidence-plan are complementary, not conflicting — both remain USE for the same task (planning, then implementation-evidence planning)', () => {
  const conflicts = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'registry', 'conflicts.json'), 'utf8')).conflicts;
  const gameSkill = getSkill('ush-game-meeting-plan');
  const repoSkill = getSkill('ush-repo-evidence-plan');
  const gameResult = evaluateEligibility({
    skill: gameSkill,
    task: { platform: 'codex', autoInvoke: true, selectedSkillIds: ['ush-repo-evidence-plan'] },
    conflicts,
  });
  const repoResult = evaluateEligibility({
    skill: repoSkill,
    task: { platform: 'codex', autoInvoke: true, selectedSkillIds: ['ush-game-meeting-plan'] },
    conflicts,
  });
  assert.equal(gameResult.decision, 'USE');
  assert.equal(repoResult.decision, 'USE');
});

// --- ush-discord-repo-cross-reference (Phase 1.2 migration) ---

test('ush-discord-repo-cross-reference: the default analyze/read-only operation is USE even without any send-related intent, permission, or capability', () => {
  const skill = getSkill('ush-discord-repo-cross-reference');
  const result = evaluateEligibility({
    skill,
    task: { platform: 'codex', autoInvoke: true, requestedOperations: ['analyze'] },
  });
  assert.equal(result.decision, 'USE');
});

test('ush-discord-repo-cross-reference: a send request without explicit intent is BLOCKed even though the skill itself is L0', () => {
  const skill = getSkill('ush-discord-repo-cross-reference');
  const result = evaluateEligibility({
    skill,
    task: { platform: 'codex', autoInvoke: false, requestedOperations: ['send'], explicitIntent: false, grantedPermissions: ['discord_send'], availableCapabilities: ['discord_send'] },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'OPERATION_NO_EXPLICIT_INTENT');
});

test('ush-discord-repo-cross-reference: a send request without the named discord_send permission is BLOCKed (fail-closed) — a generic permission grant is not enough', () => {
  const skill = getSkill('ush-discord-repo-cross-reference');
  const result = evaluateEligibility({
    skill,
    task: { platform: 'codex', autoInvoke: false, requestedOperations: ['send'], explicitIntent: true, grantedPermissions: ['some_unrelated_permission'], availableCapabilities: ['discord_send'] },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'OPERATION_MISSING_PERMISSION');
});

test('ush-discord-repo-cross-reference: a send request without the discord_send capability is BLOCKed (fail-closed)', () => {
  const skill = getSkill('ush-discord-repo-cross-reference');
  const result = evaluateEligibility({
    skill,
    task: { platform: 'codex', autoInvoke: false, requestedOperations: ['send'], explicitIntent: true, grantedPermissions: ['discord_send'] },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'OPERATION_MISSING_CAPABILITY');
});

test('ush-discord-repo-cross-reference: a send request with prepared intent, named permission, and capability is USE', () => {
  const skill = getSkill('ush-discord-repo-cross-reference');
  const result = evaluateEligibility({
    skill,
    task: { platform: 'codex', autoInvoke: false, requestedOperations: ['send'], explicitIntent: true, grantedPermissions: ['discord_send'], availableCapabilities: ['discord_send'] },
  });
  assert.equal(result.decision, 'USE');
});

// --- ush-work-announcement (Phase 1.2 migration) ---

test('ush-work-announcement: a draft request never touches an external write — USE without any publish-related intent/permission/capability', () => {
  const skill = getSkill('ush-work-announcement');
  const result = evaluateEligibility({
    skill,
    task: { platform: 'codex', autoInvoke: true, requestedOperations: ['draft'] },
  });
  assert.equal(result.decision, 'USE');
});

test('ush-work-announcement: a publish request without explicit approval intent is BLOCKed', () => {
  const skill = getSkill('ush-work-announcement');
  const result = evaluateEligibility({
    skill,
    task: { platform: 'codex', autoInvoke: false, requestedOperations: ['publish'], explicitIntent: false, grantedPermissions: ['message_publish'], availableCapabilities: ['message_publish'] },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'OPERATION_NO_EXPLICIT_INTENT');
});

test('ush-work-announcement: the publish gate uses a generic message_publish capability/permission, NOT discord_send — a non-Discord destination with the generic capability/permission is not blocked merely for lacking discord_send', () => {
  const skill = getSkill('ush-work-announcement');
  const result = evaluateEligibility({
    skill,
    task: {
      platform: 'codex',
      autoInvoke: false,
      requestedOperations: ['publish'],
      explicitIntent: true,
      grantedPermissions: ['message_publish'], // e.g. Slack/Teams/email, not Discord
      availableCapabilities: ['message_publish'],
      approvedContentHash: 'abc123',
      currentContentHash: 'abc123',
    },
  });
  assert.notEqual(result.reasonCode, 'OPERATION_MISSING_CAPABILITY');
  assert.notEqual(result.reasonCode, 'OPERATION_MISSING_PERMISSION');
  assert.equal(result.decision, 'USE');
});

test('ush-work-announcement: publish is BLOCKed when no content has been approved at all — the deterministic gate enforces this itself, not just the caller', () => {
  const skill = getSkill('ush-work-announcement');
  const result = evaluateEligibility({
    skill,
    task: {
      platform: 'codex',
      autoInvoke: false,
      requestedOperations: ['publish'],
      explicitIntent: true,
      grantedPermissions: ['message_publish'],
      availableCapabilities: ['message_publish'],
      currentContentHash: 'abc123',
      // approvedContentHash intentionally omitted
    },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'OPERATION_NO_APPROVED_CONTENT');
});

test('ush-work-announcement: material edit after approval invalidates approval — evaluateEligibility itself BLOCKs a stale approval, not merely a caller convention', () => {
  const approvedText = 'This week: shipped multiplayer sync fix.';
  const approvedHash = hashOf(approvedText);
  const materiallyEdited = 'This week: shipped multiplayer sync fix and the boss encounter.';

  const skill = getSkill('ush-work-announcement');
  const result = evaluateEligibility({
    skill,
    task: {
      platform: 'codex',
      autoInvoke: false,
      requestedOperations: ['publish'],
      explicitIntent: true,
      grantedPermissions: ['message_publish'],
      availableCapabilities: ['message_publish'],
      approvedContentHash: approvedHash,
      currentContentHash: hashOf(materiallyEdited),
    },
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reasonCode, 'OPERATION_APPROVAL_STALE');
});

test('ush-work-announcement: a publish request with prepared intent, named permission, capability, and a matching approval hash is USE', () => {
  const skill = getSkill('ush-work-announcement');
  const approvedText = 'This week: shipped multiplayer sync fix.';
  const hash = hashOf(approvedText);
  const result = evaluateEligibility({
    skill,
    task: {
      platform: 'codex',
      autoInvoke: false,
      requestedOperations: ['publish'],
      explicitIntent: true,
      grantedPermissions: ['message_publish'],
      availableCapabilities: ['message_publish'],
      approvedContentHash: hash,
      currentContentHash: hash,
    },
  });
  assert.equal(result.decision, 'USE');
});
