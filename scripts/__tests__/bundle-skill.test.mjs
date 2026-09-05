import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectSkillFiles, buildSkillBundle } from '../bundle-skill.mjs';

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
