import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateOpenAiLimits } from '../bundle-openai.mjs';
import { buildZip } from '../zip-writer.mjs';

test('validateOpenAiLimits passes for a small bundle well under every limit', () => {
  const files = [{ path: 'ush-example/SKILL.md', content: 'small' }];
  const zip = buildZip(files);
  const result = validateOpenAiLimits({ files, zip });
  assert.equal(result.valid, true);
});

test('validateOpenAiLimits fails when a single file exceeds the 25 MB per-file limit', () => {
  const files = [{ path: 'ush-example/big.md', content: 'x'.repeat(26 * 1024 * 1024) }];
  const zip = buildZip(files);
  const result = validateOpenAiLimits({ files, zip });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('25 MB')));
});

test('validateOpenAiLimits fails when the file count exceeds 500', () => {
  const files = Array.from({ length: 501 }, (_, i) => ({ path: `ush-example/f${i}.md`, content: 'x' }));
  const zip = buildZip(files);
  const result = validateOpenAiLimits({ files, zip });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('500-file')));
});
