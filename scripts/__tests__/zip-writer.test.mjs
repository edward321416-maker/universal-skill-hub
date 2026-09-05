import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildZip, readZip } from '../zip-writer.mjs';

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

test('buildZip is binary-safe: bytes that are not valid UTF-8 round-trip byte-for-byte through buildZip + readZip', () => {
  // PNG signature + a byte sequence that is invalid UTF-8 (0xFF is never a
  // valid UTF-8 leading byte) — if content were ever decoded/re-encoded as
  // UTF-8 anywhere in the pipeline, these exact bytes would not survive.
  const binaryContent = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0x00, 0xfe, 0x80, 0x81]);
  const zip = buildZip([{ path: 'ush-example/assets/pixel.png', content: binaryContent }]);
  const extracted = readZip(zip);
  assert.equal(extracted.length, 1);
  assert.ok(Buffer.isBuffer(extracted[0].content));
  assert.ok(extracted[0].content.equals(binaryContent), 'extracted bytes must equal original bytes exactly');
});

test('readZip round-trips ordinary UTF-8 text content correctly', () => {
  const textContent = 'name: ush-example\ndescription: a normal utf-8 file with é and 中文\n';
  const zip = buildZip([{ path: 'ush-example/SKILL.md', content: textContent }]);
  const extracted = readZip(zip);
  assert.equal(extracted[0].content.toString('utf8'), textContent);
});
