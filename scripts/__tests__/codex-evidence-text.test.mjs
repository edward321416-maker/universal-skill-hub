import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesSkillReadRecord, decodeRecordedText, decodeRecordedBlocks } from '../codex-evidence-text.mjs';

test('reading historical JSONL with a skill body is not a new direct load', () => {
  assert.equal(matchesSkillReadRecord('Get-Content dist/decision17-codex/P1.jsonl', 'ush-repo-evidence-plan', 'name: ush-repo-evidence-plan'), false);
});
test('direct relative and absolute installed paths remain observable', () => {
  for (const file of ['.agents/skills/ush-repo-evidence-plan/SKILL.md', 'C:\\repo\\.agents\\skills\\ush-repo-evidence-plan\\SKILL.md']) {
    assert.equal(matchesSkillReadRecord(`Get-Content '${file}'`, 'ush-repo-evidence-plan', 'name: ush-repo-evidence-plan'), true);
  }
  assert.equal(matchesSkillReadRecord('Get-Content .agents/skills/ush-repo-evidence-plan/SKILL.md', 'ush-repo-evidence-plan', 'Access denied'), false);
});
test('runtime JSON envelope is decoded without Unicode repair', () => {
  const lossy = 'origin project ? there is no dependency\n';
  assert.equal(decodeRecordedText(JSON.stringify({ chunk_id: 'example', output: lossy, exit_code: 0 })), lossy);
  assert.equal(decodeRecordedText('origin project — there is no dependency\n'), 'origin project — there is no dependency\n');
});
test('non-envelope JSON and malformed text remain verbatim', () => {
  for (const raw of ['{"output":42}', '{malformed', '{"output":"body"}']) assert.equal(decodeRecordedText(raw), raw);
});

test('parallel tool envelopes preserve each output independently', () => {
  const raw = JSON.stringify([{ chunk_id: 'a', output: 'body ?\r\n' }, { chunk_id: 'b', output: 'command failed' }]);
  assert.deepEqual(decodeRecordedBlocks(raw), ['body ?\r\n', 'command failed']);
  assert.deepEqual(decodeRecordedBlocks('[{"output":"body"}]'), ['[{"output":"body"}]']);
});
