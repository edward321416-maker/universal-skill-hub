import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectSkillFiles, buildSkillBundle } from '../bundle-skill.mjs';
import { readZip } from '../zip-writer.mjs';

const fakeFs = {
  files: {
    'skills/global/ush-example/SKILL.md': '---\nname: ush-example\n---\nbody',
    'skills/global/ush-example/references/notes.md': 'notes',
  },
  existsSync(p) {
    return p in this.files || Object.keys(this.files).some((f) => f.startsWith(p + '/'));
  },
  statSync(p) {
    return { isDirectory: () => !(p in this.files) };
  },
  readdirSync(p) {
    const prefix = p.endsWith('/') ? p : p + '/';
    const seen = new Set();
    for (const f of Object.keys(this.files)) {
      if (f.startsWith(prefix)) {
        const rest = f.slice(prefix.length).split('/')[0];
        seen.add(rest);
      }
    }
    return [...seen];
  },
  readFileSync(p) {
    return this.files[p];
  },
};

test('collectSkillFiles walks the canonical skill directory and returns bundle-relative paths rooted at the skill id', () => {
  const files = collectSkillFiles({ skillDir: 'skills/global/ush-example', skillId: 'ush-example', fs: fakeFs });
  const paths = files.map((f) => f.path).sort();
  assert.deepEqual(paths, ['ush-example/SKILL.md', 'ush-example/references/notes.md']);
});

test('buildSkillBundle produces a zip whose only top-level entry is the skill id folder (claude.ai / OpenAI API requirement: skill folder at zip root)', () => {
  const zip = buildSkillBundle({ skillDir: 'skills/global/ush-example', skillId: 'ush-example', fs: fakeFs });
  const text = zip.toString('latin1');
  assert.ok(text.includes('ush-example/SKILL.md'));
  assert.ok(!/[A-Za-z]:[\\/]/.test(text.replace(/PK.{0,60}/g, '')), 'bundle must not embed any local absolute path');
});

test('buildSkillBundle is deterministic across two calls against the same fake filesystem', () => {
  const zip1 = buildSkillBundle({ skillDir: 'skills/global/ush-example', skillId: 'ush-example', fs: fakeFs });
  const zip2 = buildSkillBundle({ skillDir: 'skills/global/ush-example', skillId: 'ush-example', fs: fakeFs });
  assert.ok(zip1.equals(zip2));
});

test('collectSkillFiles + buildZip is binary-safe end-to-end against a REAL filesystem: an asset with invalid-UTF-8 bytes round-trips exactly, alongside an ordinary UTF-8 SKILL.md', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ush-bundle-test-'));
  try {
    const skillDir = path.join(tmpRoot, 'ush-example');
    fs.mkdirSync(path.join(skillDir, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: ush-example\ndescription: has a binary asset\n---\nbody\n', 'utf8');
    const binaryBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0x00, 0xfe, 0x80, 0x81]);
    fs.writeFileSync(path.join(skillDir, 'assets', 'pixel.png'), binaryBytes);

    const zip = buildSkillBundle({ skillDir, skillId: 'ush-example' });
    const extracted = readZip(zip);
    const byPath = Object.fromEntries(extracted.map((e) => [e.path.replace(/\\/g, '/'), e.content]));

    assert.ok(byPath['ush-example/assets/pixel.png'].equals(binaryBytes), 'binary asset must round-trip byte-for-byte');
    assert.equal(byPath['ush-example/SKILL.md'].toString('utf8'), '---\nname: ush-example\ndescription: has a binary asset\n---\nbody\n');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
