import fs from 'node:fs';
import path from 'node:path';
import { digest } from './orca-bootstrap.mjs';

// Extract bounded evidence from completed native stream-json/debug receipts.
// Never launches inference and never treats model narrative as a successful load.
const [root, output] = process.argv.slice(2);
if (!root || !output) throw new Error('Usage: node scripts/claude-scoping-evidence.mjs <probe-root> <output.json>');
const cases = [];
for (const name of ['negative', 'positive']) {
  const streamFile = path.join(root, name + '.jsonl'), debugFile = path.join(root, name + '-debug.log');
  const stream = fs.readFileSync(streamFile), debug = fs.readFileSync(debugFile);
  const rows = stream.toString('utf8').trim().split(/\r?\n/).map(JSON.parse);
  const init = rows.find(r => r.type === 'system' && r.subtype === 'init');
  const result = rows.find(r => r.type === 'result');
  if (!init || !result) throw new Error('INCOMPLETE_RUNTIME_RECEIPT');
  const calls = rows.flatMap(r => (r.message?.content ?? []).filter(c => c.type === 'tool_use'));
  const invocations = calls.filter(c => c.name === 'Skill').map(c => c.input.skill);
  const loads = [];
  for (const r of rows.filter(r => r.type === 'user')) {
    for (const c of r.message?.content ?? []) {
      const text = c.text ?? '';
      const match = text.match(/^Base directory for this skill: ([^\r\n]+)/);
      if (!match || !text.includes('# Repo Evidence Plan') || !invocations.includes('ush-repo-evidence-plan')) continue;
      const file = path.join(match[1], 'SKILL.md');
      const body = fs.readFileSync(file);
      const rendered = body.toString('utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n*/, '');
      loads.push({ skill: 'ush-repo-evidence-plan', reportedFile: file, observedFileSha256: digest(body),
        completeRenderedBodyMatched: text.includes(rendered), projectLocal: path.resolve(file).startsWith(path.resolve(root) + path.sep), messageUuid: r.uuid });
    }
  }
  const lines = debug.toString('utf8').split(/\r?\n/);
  cases.push({ name, sessionId: init.session_id, runtime: init.claude_code_version, model: init.model,
    completed: result.subtype === 'success' && result.is_error === false,
    raw: [{ file: streamFile, sha256: digest(stream) }, { file: debugFile, sha256: digest(debug) }],
    startupHubNames: init.slash_commands.filter(n => n.startsWith('ush-')),
    startupSkillsFieldCount: init.skills.length, startupSkillsFieldHubNames: init.skills.filter(n => n.startsWith('ush-')), postBudgetModelVisibleCount: null,
    debugSignals: lines.filter(l => /Loading skills from:|Loaded \d+ unique skills|Total plugin skills loaded:|getSkills returning:|Sending \d+ skills via attachment|Skill listing over budget/.test(l)),
    overflowObserved: lines.some(l => l.includes('Skill listing over budget')),
    toolCalls: calls.map(c => ({ name: c.name, ...(c.name === 'Skill' ? { skill: c.input.skill } : {}) })),
    hubInvocations: invocations.filter(n => n.startsWith('ush-')), loads,
    tokenUsage: { input: result.usage.input_tokens, output: result.usage.output_tokens,
      cacheCreationInput: result.usage.cache_creation_input_tokens, cacheReadInput: result.usage.cache_read_input_tokens } });
}
fs.writeFileSync(output, JSON.stringify({ cases, acceptance: 'PARTIAL', limitations: ['HOST_GLOBAL_BUDGET_CONFOUND', 'GLOBAL_COPY_SELECTED', 'HISTORICAL_WARNING_NOT_REPRODUCED'] }, null, 2) + '\n');
console.log(JSON.stringify(cases.map(c => ({ name: c.name, completed: c.completed, overflowObserved: c.overflowObserved, hubInvocations: c.hubInvocations, loads: c.loads })), null, 2));
