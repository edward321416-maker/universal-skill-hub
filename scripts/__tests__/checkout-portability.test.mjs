import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkConsistency } from '../registry-consistency.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

for (const autocrlf of ['true', 'input', 'false']) {
  test(`fresh checkout with core.autocrlf=${autocrlf} preserves LF text and exact canonical hashes`, () => {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'ush-checkout-'));
    try {
      const checkout = path.join(sandbox, 'repo');
      git(root, ['clone', '--quiet', '--no-local', '--no-checkout', root, checkout]);
      git(checkout, ['read-tree', 'HEAD']);
      // Exercise the candidate policy before it is committed, using only
      // this disposable clone's index. No user/global Git settings change.
      const attributes = path.join(root, '.gitattributes');
      if (fs.existsSync(attributes)) {
        fs.copyFileSync(attributes, path.join(checkout, '.gitattributes'));
        git(checkout, ['-c', `core.autocrlf=${autocrlf}`, 'add', '.gitattributes']);
      }
      git(checkout, ['-c', `core.autocrlf=${autocrlf}`, 'checkout-index', '--all', '--force']);

      const registry = JSON.parse(fs.readFileSync(path.join(checkout, 'registry/skills-index.json'), 'utf8'));
      const mismatches = registry.skills.filter((skill) =>
        sha256(fs.readFileSync(path.join(checkout, skill.path, 'SKILL.md'))) !== skill.content_sha256
      ).map((skill) => skill.skill_id);
      assert.deepEqual(mismatches, [], 'checkout must preserve the registered exact-byte SHA-256 values');

      const textFiles = git(checkout, ['ls-files', '-z']).split('\0').filter((file) =>
        /\.(md|json|mjs|yml)$/.test(file) || ['.gitattributes', '.gitignore'].includes(file)
      );
      assert.ok(textFiles.length > 0);
      const crlfFiles = textFiles.filter((file) => fs.readFileSync(path.join(checkout, file)).includes(Buffer.from('\r\n')));
      assert.deepEqual(crlfFiles, [], 'target text, including generated adapters and test fixtures, must check out as LF');
    } finally {
      // Only remove the unique temporary directory created by this test.
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });
}

test('the existing validator rejects CRLF and content mutations without pre-hash normalization', () => {
  const registry = JSON.parse(git(root, ['show', 'HEAD:registry/skills-index.json']));
  for (const skill of registry.skills) {
    const canonicalContent = git(root, ['show', `HEAD:${skill.path}/SKILL.md`]);
    assert.equal(checkConsistency({ registryEntry: skill, canonicalContent }).consistent, true);
    for (const changed of [canonicalContent.replaceAll('\n', '\r\n'), `${canonicalContent}tampered\n`]) {
      const result = checkConsistency({ registryEntry: skill, canonicalContent: changed });
      assert.equal(result.consistent, false, skill.skill_id);
      assert.ok(result.errors.some((error) => error.includes('content_sha256')), skill.skill_id);
    }
  }
});
