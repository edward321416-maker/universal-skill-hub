import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { matchesSkillReadRecord, decodeRecordedBlocks } from './codex-evidence-text.mjs';

// Read-only evidence extraction. No model calls, encoding repair or inferred
// runtime omission reasons. Raw runtime records remain outside tracked evidence.
const [probe, sessions, destination] = process.argv.slice(2);
if (!probe || !sessions || !destination) throw new Error('Usage: node scripts/codex-boundary-audit.mjs <probe> <sessions-day> <output>');
const sha = value => createHash('sha256').update(value).digest('hex');
const read = file => fs.readFileSync(file, 'utf8');
const json = file => JSON.parse(read(file));
const lines = file => read(file).trim().split(/\r?\n/).map(JSON.parse);
const measure = text => ({ utf8Bytes: Buffer.byteLength(text), utf16Units: text.length, codePoints: [...text].length, sha256: sha(text) });
const norm = value => value.replace(/\\+/g, '/').toLowerCase();
function catalog(file) {
  const text = json(file).flatMap(r => r.content ?? []).map(c => c.text ?? '').join('\n');
  const roots = new Map([...text.matchAll(/^- `([^`]+)` = `([^`]+)`/gm)].map(m => [m[1], m[2]]));
  return [...text.matchAll(/^- (.+?): (.*?)\(file: ([^)]+)\)$/gm)].map(m => {
    const [alias, ...rest] = m[3].split('/');
    return { name: m[1], description: m[2].trim(), path: roots.has(alias) ? roots.get(alias) + '/' + rest.join('/') : m[3] };
  });
}
const ids = ['ush-repo-evidence-plan', 'ush-work-announcement'];
const sources = ids.map(id => { const file = path.resolve('.agents/skills', id, 'SKILL.md'); return { id, file, text: read(file) }; });
const transport = [];
const routing = [];
for (const name of ['P1', 'P2', 'CONTROL_UTF8', 'P1_ONE', 'P1_TWO', 'P1_ONE_REPEAT']) {
  const file = path.join(probe, name + '.jsonl');
  if (!fs.existsSync(file)) continue;
  const rows = lines(file);
  const thread = rows.find(r => r.type === 'thread.started')?.thread_id;
  const sessionFile = fs.readdirSync(sessions).find(f => f.endsWith(thread + '.jsonl'));
  const persisted = sessionFile ? lines(path.join(sessions, sessionFile)) : [];
  const outputs = persisted.filter(r => r.type === 'response_item' && r.payload?.type === 'custom_tool_call_output').flatMap(r => Array.isArray(r.payload.output) ? r.payload.output.map(c => c.text ?? '') : [r.payload.output ?? '']);
  const decoded = outputs.flatMap(decodeRecordedBlocks);
  const commands = rows.filter(r => r.type === 'item.completed' && r.item?.type === 'command_execution').map(r => r.item);
  const reads = [];
  for (const command of commands) for (const source of sources) {
    const returned = command.aggregated_output;
    const start = returned.indexOf('name: ' + source.id);
    if (!matchesSkillReadRecord(command.command, source.id, returned) || start < 0) continue;
    reads.push({ id: source.id, command: command.command, exitCode: command.exit_code });
    // Alignment normalizes CRLF only for locating the first Unicode difference.
    // It never upgrades exactness or substitutes a normalized hash.
    const a = source.text.slice(source.text.indexOf('name: ' + source.id)).replaceAll('\r\n', '\n');
    const b = returned.slice(start).replaceAll('\r\n', '\n');
    let at = 0; while (at < a.length && a[at] === b[at]) at++;
    const codes = text => [...text.slice(at, at + 12)].map(c => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'));
    transport.push({ case: name, eventId: command.id, id: source.id,
      filesystem: { path: source.file, ...measure(source.text) }, readToolInput: command.command,
      rawProcessStdoutBytes: null, preSerializationRuntimeText: null,
      serializedCliOutput: measure(returned), persistedToolResponseEqualsCliOutput: outputs.includes(returned),
      decodedPersistedToolResponseEqualsCliOutput: decoded.includes(returned),
      matchedPersistedTextBlock: outputs.find(o => decodeRecordedBlocks(o).includes(returned)) ? measure(outputs.find(o => decodeRecordedBlocks(o).includes(returned))) : null,
      persistedToolResponseContainsExactSource: decoded.some(o => o.includes(source.text)),
      actualModelInputWireBytes: null, extractorOutput: measure(returned),
      exactSourcePresent: returned.includes(source.text),
      firstAlignedDifference: at === a.length ? null : { offsetFromName: at, sourceCodePoints: codes(a), returnedCodePoints: codes(b) },
      boundary: 'FILESYSTEM_TO_PERSISTED_TOOL_RESPONSE; intermediate raw stdout and pre-serialization stages not exposed',
      status: returned.includes(source.text) ? 'TEXT_MATCH_WIRE_EXACTNESS_UNVERIFIED' : 'TRANSPORT_EXACTNESS_BLOCKED' });
  }
  const promptFile = path.join(probe, name + '-prompt.json');
  routing.push({ case: name, thread, completed: rows.some(r => r.type === 'turn.completed'),
    runtime: persisted.find(r => r.type === 'turn_context')?.payload?.model ?? null,
    reasoningEffort: persisted.find(r => r.type === 'turn_context')?.payload?.effort ?? null,
    sandbox: persisted.find(r => r.type === 'turn_context')?.payload?.sandbox_policy ?? null,
    visibleHub: fs.existsSync(promptFile) ? catalog(promptFile).filter(e => e.name.startsWith('ush-')) : null,
    reads, commands: commands.map(c => ({ id: c.id, command: c.command, exitCode: c.exit_code })),
    assistantPublicStatements: persisted.filter(r => r.type === 'response_item' && r.payload?.type === 'message' && r.payload.role === 'assistant').flatMap(r => r.payload.content ?? []).map(c => c.text ?? '').filter(t => /skill/i.test(t)).map(t => t.slice(0, 1200)),
    rawSha256: sha(fs.readFileSync(file)) });
}
const inventory = json(path.join(probe, 'skills-list.json')).result.data[0];
const rendered = catalog(path.join(probe, 'local-prompt.json'));
const renderedPaths = new Set(rendered.map(s => norm(s.path)));
const absent = inventory.skills.filter(s => s.enabled && !renderedPaths.has(norm(s.path))).map(s => ({
  path: s.path, name: s.name, scope: s.scope, enabled: s.enabled,
  classification: 'unknown', runtimeReportedReason: null,
  sameNameRenderedPaths: rendered.filter(r => r.name === s.name).map(r => r.path),
  note: 'Same-name presence is a duplicate observation, not proof of omission cause.'
}));
const result = { head: '52100cb1966603dda93f5c2049fe5e88d3972e2d', transport, routing,
  context: { discovered: inventory.skills.length, rendered: rendered.length, absent, discoveryErrors: inventory.errors,
    invalidErrorsAreSeparateFromEnabledDifference: true, hubVisible: rendered.filter(s => s.name.startsWith('ush-')),
    runtimeOmittedCount: null, runtimeOmissionReasons: null, attribution: 'OVERFLOW_ATTRIBUTION_UNVERIFIED' },
  interpretation: 'Persisted tool responses are observable serialized records, not a separate capture of actual model-input wire bytes. Public assistant statements do not prove hidden semantic causality.' };
fs.writeFileSync(destination, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ transportRecords: transport.length, decodedPersistedParity: transport.every(r => r.decodedPersistedToolResponseEqualsCliOutput), absent: absent.length, cases: routing.map(r => ({ case: r.case, completed: r.completed, reads: r.reads.map(s => s.id) })) }));
