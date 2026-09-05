import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildZip } from '../zip-writer.mjs';

test('buildZip produces a buffer starting with a local file header signature and ending with an end-of-central-directory signature', () => {
  const zip = buildZip([{ path: 'ush-example/SKILL.md', content: '---\nname: ush-example\n---\nbody' }]);
  assert.equal(zip.readUInt32LE(0), 0x04034b50, 'expected local file header signature at offset 0');
  const eocdSig = zip.readUInt32LE(zip.length - 22);
  assert.equal(eocdSig, 0x06054b50, 'expected end-of-central-directory signature');
});

test('buildZip is byte-for-byte deterministic across two calls with identical input', () => {
  const entries = [
    { path: 'ush-example/SKILL.md', content: 'a' },
    { path: 'ush-example/references/notes.md', content: 'b' },
  ];
  const zip1 = buildZip(entries);
  const zip2 = buildZip(entries);
  assert.ok(zip1.equals(zip2));
});

test('buildZip places every entry under the given root folder path, not a bare filename', () => {
  const zip = buildZip([{ path: 'ush-example/SKILL.md', content: 'x' }]);
  const text = zip.toString('latin1');
  assert.ok(text.includes('ush-example/SKILL.md'));
});

test('buildZip refuses an entry path that is absolute or escapes with ".."', () => {
  assert.throws(() => buildZip([{ path: 'C:/Users/admin/SKILL.md', content: 'x' }]), /absolute|relative/i);
  assert.throws(() => buildZip([{ path: '../escape/SKILL.md', content: 'x' }]), /\.\.|relative/i);
});
