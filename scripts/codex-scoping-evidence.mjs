import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { digest } from './orca-bootstrap.mjs';

// Bounded extraction only. Raw prompts/rollouts stay local; never reuse these
// observations as Phase 1.3 fixtures. No inference or auth access here.
const [probe, sessions, output] = process.argv.slice(2);
if (!probe || !sessions || !output) throw new Error('Usage: node scripts/codex-scoping-evidence.mjs <probe-dir> <sessions-day-dir> <output.json>');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const norm = p => p.replace(/\\+/g, '/').replace(/\/+/g, '/').toLowerCase();
const receipt = file => ({ file, sha256: digest(fs.readFileSync(file)) });
const registry = json('registry/skills-index.json');
const ids = new Set(registry.skills.map(s => s.skill_id));
function prompt(name) {
  const file = path.join(probe, name + '-prompt.json');
  const text = json(file).flatMap(r => r.content ?? []).map(c => c.text ?? '').join('\n');
  const roots = new Map([...text.matchAll(/^- `([^`]+)` = `([^`]+)`/gm)].map(m => [m[1], m[2]]));
  const entries = [...text.matchAll(/^- (.+?): (.*?)\(file: ([^)]+)\)$/gm)].map(m => {
    const slash = m[3].indexOf('/'), alias = m[3].slice(0, slash);
    return { name: m[1], description: m[2].trim(), path: roots.has(alias) ? roots.get(alias) + '/' + m[3].slice(slash + 1) : m[3] };
  });
  return { raw: receipt(file), entries, count: entries.length, descriptionsPresent: entries.filter(e => e.description).length,
    hub: entries.filter(e => ids.has(e.name)), budgetWarning: /skills? (?:context )?budget|skills? listing over budget/i.test(text) };
}
const baseline = prompt('baseline'), local = prompt('local');
const discoveryFile = path.join(probe, 'skills-list.json');
const discovery = json(discoveryFile).result.data[0];
const visiblePaths = new Set(local.entries.map(e => norm(e.path)));
const enabled = discovery.skills.filter(s => s.enabled);
const missing = enabled.filter(s => !visiblePaths.has(norm(s.path)));
const placement = json(path.join(probe, 'placement.json'));
const localSnapshots = placement.report.candidates.map(s => {
  const file = path.resolve('.agents/skills', s.skill_id, 'SKILL.md');
  return { id: s.skill_id, path: file, sha256: digest(fs.readFileSync(file)), expectedSha256: s.content_sha256 };
});
if (localSnapshots.some(s => s.sha256 !== s.expectedSha256)) throw new Error('LOCAL_SNAPSHOT_DRIFT');
const cases = [];
for (const name of ['P1', 'P2', 'N1', 'CONTROL', 'CONTROL_UTF8']) {
  const file = path.join(probe, name + '.jsonl');
  const rows = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
  const thread = rows.find(r => r.type === 'thread.started')?.thread_id;
  const done = rows.find(r => r.type === 'turn.completed' || r.type === 'turn.failed');
  if (!done) throw new Error('INCOMPLETE_CASE: ' + name);
  const commands = rows.filter(r => r.type === 'item.completed' && r.item?.type === 'command_execution').map(r => r.item);
  const loads = [];
  for (const c of commands) {
    for (const s of localSnapshots) {
      if (!/Get-Content/i.test(c.command) || !norm(c.command).includes(norm(s.path)) || !c.aggregated_output.includes('name: ' + s.id)) continue;
      loads.push({ skillId: s.id, path: s.path, fileSnapshotSha256: s.sha256, eventId: c.id, command: c.command,
        commandExitCode: c.exit_code, returnedBody: true,
        exactReturnedTextMatchesFile: c.aggregated_output.includes(fs.readFileSync(s.path, 'utf8')),
        returnedOutputSha256: digest(Buffer.from(c.aggregated_output)), runtimeReportedHash: null });
    }
  }
  const sessionFile = fs.readdirSync(sessions).find(f => f.endsWith(thread + '.jsonl'));
  const sessionRows = sessionFile ? fs.readFileSync(path.join(sessions, sessionFile), 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse) : [];
  const context = sessionRows.find(r => r.type === 'turn_context')?.payload;
  const meta = sessionRows.find(r => r.type === 'session_meta')?.payload;
  cases.push({ name, kind: name.startsWith('CONTROL') ? 'EXPLICIT_DIAGNOSTIC_NOT_ROUTING' : 'PURE_IMPLICIT', thread,
    completed: done.type === 'turn.completed', runtime: { version: meta?.cli_version ?? null, model: context?.model ?? null, reasoningEffort: context?.effort ?? null, sandbox: context?.sandbox_policy ?? null, approvalPolicy: context?.approval_policy ?? null },
    projectCandidates: localSnapshots.map(s => s.id), modelVisible: local.hub, actualSkillIds: [...new Set(loads.map(l => l.skillId))],
    exactLoadedPaths: loads.map(l => l.path), exactLoadedHashes: loads.map(l => ({ hash: l.fileSnapshotSha256, basis: 'VERIFIED_PLACEMENT_AND_POST_RUN_FILE_SNAPSHOT', runtimeTextExact: l.exactReturnedTextMatchesFile })),
    selectionEvidence: loads, commandCount: commands.length, failedCommandCount: commands.filter(c => c.exit_code !== 0).length,
    toolCalls: commands.map(c => ({ eventId: c.id, command: c.command, exitCode: c.exit_code })), usage: done.usage ?? null,
    raw: receipt(file), stderr: receipt(path.join(probe, name + '-stderr.txt')) });
}
const globalBefore = json(path.join(probe, 'global-snapshot.json'));
const globalUnchanged = globalBefore.every(s => s.present && digest(fs.readFileSync(path.join(os.homedir(), '.agents/skills', s.id, 'SKILL.md'))) === s.sha256);
const nativeFile = path.join(probe, 'native-control/.agents/skills/ush-repo-evidence-plan/SKILL.md');
const nativeBefore = json(path.join(probe, 'native-before.json'));
const result = { observedAt: new Date().toISOString(), headBefore: 'b6de9da68df9ba69410086f5924505485fffbfa3', codexVersion: cases[0].runtime.version,
  project: placement.project, localSnapshots, globalDuplicateSnapshots: globalBefore, globalUnchanged,
  globalSnapshotInterval: 'After initial implicit cases through final extraction; not a pre-case snapshot',
  hardenedReconciliation: json(path.join(probe, 'hardened-reconciliation.json')),
  contextBudget: { discovered: discovery.skills.length, enabled: enabled.length, discoveryErrors: discovery.errors, raw: receipt(discoveryFile),
    baseline: { visible: baseline.count, hub: baseline.hub, descriptionsPresent: baseline.descriptionsPresent, warning: baseline.budgetWarning, raw: baseline.raw },
    afterLocal: { visible: local.count, hub: local.hub, descriptionsPresent: local.descriptionsPresent, warning: local.budgetWarning, raw: local.raw },
    discoveredPathsAbsentFromRenderedPrompt: missing.length, absentPaths: missing.map(s => s.path),
    runtimeReportedOmittedCount: null, runtimeNumericBudget: null, attribution: 'OVERFLOW_ATTRIBUTION_UNVERIFIED',
    note: 'Path-set difference is computed from separate quota-free diagnostics, not a runtime-issued omitted counter. No numeric budget is inferred.' },
  cases, native: { communityCli: '1.5.26', idempotence: json(path.join(probe, 'native-idempotence.json')),
    syntheticEditOverwritten: digest(fs.readFileSync(nativeFile)) === nativeBefore.sha256,
    localUpdateOutput: fs.readFileSync(path.join(probe, 'native-update.txt'), 'utf8').trim(),
    receipts: ['native-install.json', 'native-conflict.json', 'native-list.json', 'orca-discovery.json'].map(n => receipt(path.join(probe, n))) },
  outcome: 'PARTIAL', caveats: ['P1 reads both candidates', 'implicit stdout does not byte-match the canonical UTF-8 file', 'explicit diagnostics do not upgrade pure implicit cases', 'one third-party invalid-YAML discovery error preserved'] };
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ discovered: enabled.length, rendered: local.count, absent: missing.length, cases: cases.map(c => ({ name: c.name, skills: c.actualSkillIds, failed: c.failedCommandCount })) }, null, 2));
