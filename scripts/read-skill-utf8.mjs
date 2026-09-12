import fs from 'node:fs';
import { digest, safePath } from './orca-bootstrap.mjs';

// Read-only text transport, not an eligibility decision or a host permission grant.
// ASCII JSON avoids legacy shell output code pages; content remains exact Unicode.
try {
  const [skillId, ...extra] = process.argv.slice(2);
  if (extra.length || !/^ush-[a-z0-9-]+$/.test(skillId ?? '')) throw new Error('INVALID_SKILL_ID');
  const bytes = fs.readFileSync(safePath(process.cwd(), '.agents/skills/' + skillId + '/SKILL.md'));
  const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const result = { skillId, encoding: 'utf-8', sha256: digest(bytes), content };
  process.stdout.write(JSON.stringify(result).replace(/[\u007f-\uffff]/g,
    char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0')) + '\n');
} catch (error) {
  console.error(JSON.stringify({ error: 'SKILL_READ_FAILED', code: error.code ?? error.message }));
  process.exitCode = 1;
}
