import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { reconcileProject } from './project-scoping.mjs';
import { safePath } from './orca-bootstrap.mjs';

const fail = code => { throw new Error(code); };
const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const args = Object.create(null);
try {
  const flags = new Set(['--apply', '--confirm-removal']);
  const values = new Set(['--project-root', '--context', '--runtime']);
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (Object.hasOwn(args, key) || (!flags.has(key) && !values.has(key))) fail('INVALID_ARGUMENT');
    if (flags.has(key)) args[key] = true;
    else {
      const value = argv[++i];
      if (!value || value.startsWith('--')) fail('INVALID_ARGUMENT_VALUE');
      args[key] = value;
    }
  }
  for (const key of ['--project-root', '--context']) {
    if (!args[key] || !path.isAbsolute(args[key])) fail('INVALID_ABSOLUTE_PATH');
  }
  if (args['--confirm-removal'] && !args['--apply']) fail('INVALID_CONFIRMATION');
  const targetRoot = safePath(args['--project-root']);
  if (!fs.statSync(targetRoot).isDirectory()) fail('INVALID_PROJECT_ROOT');
  const gitRoot = execFileSync('git', ['-C', targetRoot, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (fs.realpathSync(targetRoot) !== fs.realpathSync(gitRoot)) fail('INVALID_PROJECT_ROOT');
  const contextFile = safePath(args['--context']);
  const readJson = file => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { fail('INVALID_JSON_INPUT'); }
  };
  const load = () => {
    const context = readJson(contextFile);
    if (!context || typeof context !== 'object' || Array.isArray(context)) fail('INVALID_PROJECT_CONTEXT');
    if (args['--runtime'] && context.runtime && args['--runtime'] !== context.runtime) fail('INVALID_RUNTIME_CONFLICT');
    const runtime = context.runtime ?? args['--runtime'];
    if (!['codex', 'claude-code'].includes(runtime)) fail('UNSUPPORTED_RUNTIME');
    return { sourceRoot, targetRoot, project: { ...context, runtime },
      registry: readJson(path.join(sourceRoot, 'registry/skills-index.json')),
      conflicts: readJson(path.join(sourceRoot, 'registry/conflicts.json')).conflicts };
  };
  const print = (mode, report) => {
    const counts = {};
    for (const { action } of report.actions) counts[action] = (counts[action] ?? 0) + 1;
    console.log(JSON.stringify({ mode, sourceRoot, targetRoot, runtime: report.runtime,
      candidateIds: report.candidates.map(s => s.skill_id), excluded: report.excluded,
      actions: report.actions, actionCounts: counts, metrics: report.metrics, budget: report.budget,
      receipt: path.join(targetRoot, report.runtime === 'codex' ? '.agents' : '.claude', '.ush-project-scope.json') }));
  };
  print('PREVIEW', reconcileProject(load()));
  if (args['--apply']) print('APPLIED', reconcileProject({ ...load(), apply: true, confirmRemoval: args['--confirm-removal'] === true }));
} catch (error) {
  // Do not echo JSON contents or captured Git output into the report.
  console.error(error.code || error.message);
  process.exitCode = 1;
}
