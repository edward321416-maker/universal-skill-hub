import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const fail = (code, detail = '') => { throw new Error(code + ': ' + detail); };
const json = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const same = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;

export function safePath(root, relative = '') {
  const absolute = path.resolve(root, relative);
  const base = path.resolve(root);
  if (absolute !== base && !absolute.startsWith(base + path.sep)) fail('PATH_ESCAPE');
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try { if (fs.lstatSync(current).isSymbolicLink()) fail('SYMLINK', current); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return absolute;
}

// Sealing is an operator action after source pin/origin/full verification.
// Startup never regenerates the approved manifest to repair failed checks.
export function createManifest(root, pin) {
  if (!/^[a-f0-9]{40}$/.test(pin)) fail('INVALID_PIN');
  const files = {};
  function walk(relative = '') {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      if (relative === 'node_modules' && entry.name === '.bin') continue;
      const name = path.posix.join(relative, entry.name);
      const full = safePath(root, name);
      if (entry.isDirectory()) walk(name);
      else if (entry.isFile()) files[name] = digest(fs.readFileSync(full));
      else fail('UNSUPPORTED_FILE', name);
    }
  }
  walk();
  return { root: path.resolve(root), pin, files };
}

export function verifyRelease(release) {
  if (!release || !/^[a-f0-9]{40}$/.test(release.pin) || !release.files) fail('UNAPPROVED_RELEASE');
  for (const name of ['package.json', 'package-lock.json', 'registry/skills-index.json', 'registry/conflicts.json', 'scripts/install-skills.mjs', 'scripts/eligibility.mjs']) {
    if (!release.files[name]) fail('INTEGRITY', 'manifest omits ' + name);
  }
  for (const [relative, expected] of Object.entries(release.files)) {
    const full = safePath(release.root, relative);
    if (!fs.existsSync(full) || digest(fs.readFileSync(full)) !== expected) fail('INTEGRITY', relative);
  }
  const registry = json(path.join(release.root, 'registry/skills-index.json'));
  if (registry.skills.length !== 6) fail('INTEGRITY', 'expected six approved skills');
  for (const skill of registry.skills) {
    if (!/^ush-[a-z0-9-]+$/.test(skill.skill_id)) fail('INTEGRITY', 'invalid id');
    const relative = skill.path + '/SKILL.md';
    if (!release.files[relative] || digest(fs.readFileSync(safePath(release.root, relative))) !== skill.content_sha256) fail('INTEGRITY', skill.skill_id);
    if (skill.status !== 'EXPERIMENTAL') fail('INTEGRITY', 'lifecycle changed');
    for (const platform of ['codex', 'claude-code']) {
      if (!release.files['adapters/' + platform + '/' + skill.skill_id + '/SKILL.md']) fail('INTEGRITY', 'missing adapter');
    }
  }
  return registry;
}

export function resolveContext({ cwd, repos, worktrees, allowedRepoIds = [], allowedOwners = [] }) {
  const actual = fs.realpathSync(safePath(cwd));
  const tree = worktrees.find((entry) => { try { return same(fs.realpathSync(entry.path), actual); } catch { return false; } });
  if (!tree) fail('UNREGISTERED', actual);
  if ((tree.hostId ?? tree.identity?.executionHostId) !== 'local' ||
      (tree.identity?.executionHostId && tree.identity.executionHostId !== 'local')) fail('HOST');
  const repo = repos.find((entry) => entry.id === tree.repoId);
  if (!repo) fail('UNREGISTERED', 'repository missing');
  const owner = repo.gitRemoteIdentity?.canonicalKey?.match(/^github\.com\/([^/]+)\/[^/]+$/)?.[1];
  if (!allowedRepoIds.includes(repo.id) && !allowedOwners.includes(owner)) fail('OWNERSHIP', repo.id);
  return { target: actual, repoId: repo.id, worktreeId: tree.id, hostId: 'local' };
}

const start = '<!-- BEGIN Universal Skill Hub startup -->';
const end = '<!-- END Universal Skill Hub startup -->';
function policyBlock(release, platform, gateCommand) {
  return [start, '## Universal Skill Hub candidates',
    'Deployment pin: ' + release.pin + '. Local skills: ' + (platform === 'codex' ? '.agents' : '.claude') + '/skills.',
    'Existing project policies and locks take precedence. Select only materially relevant skills',
    'without requiring a skill name; skip the Hub for unrelated tasks. Candidates:',
    'ush-repo-evidence-plan (read-only repository planning); ush-concurrent-edit-coordination',
    '(actual overlapping implementation diffs); ush-game-meeting-plan (game meeting decisions);',
    'ush-discord-repo-cross-reference (claim analysis); ush-work-announcement (merged-work draft);',
    'ush-github-task-flow (explicitly requested issue/branch/test/open-PR delivery).',
    'Read the selected installed SKILL.md completely and successfully before following its',
    'workflow and Safety/Result Contracts. Catalog entries, hash reads, narratives and failed',
    'reads are not skill invocation evidence. Do not preload all six bodies.',
    'Call the deployment eligibility bridge with actual inputs/tools/capabilities/permissions',
    'and every intended operation. Unknown facts are unavailable. Honor BLOCK and SKIP.',
    ...(gateCommand ? ['Bridge command (JSON data on stdin; never shell-interpolate task text):', '`' + gateCommand + '`'] : []),
    'The bridge calls existing evaluateEligibility; task enforcement is ADVISORY, not a',
    'host tool interceptor. Eligibility does not grant permissions or establish semantic fit.',
    'All skills remain EXPERIMENTAL. Never auto-invoke L3 external writes. Merge/send/publish',
    'need separate explicit intent, actual capability and specific permission. Publication',
    'needs the known destination and exact approved text; preserve the approved-content hash',
    'gate. L4 needs informed confirmation. Never override project locks or fabricate evidence.',
    'Do not commit local Hub deployment files with unrelated project work.', end].join('\n');
}

async function acquireLock(file) {
  const until = Date.now() + 15000;
  for (;;) {
    try { return fs.openSync(file, 'wx'); }
    catch (error) { if (error.code !== 'EEXIST') throw error; if (Date.now() >= until) fail('LOCK_BUSY'); await delay(40); }
  }
}

export async function deploy({ release, target, platform, approvedPolicyHashes = [], gateCommand }) {
  const registry = verifyRelease(release);
  if (!['codex', 'claude-code'].includes(platform)) fail('PLATFORM_UNSUPPORTED');
  safePath(target);
  const folder = platform === 'codex' ? '.agents' : '.claude';
  const policyFile = safePath(target, platform === 'codex' ? 'AGENTS.md' : 'CLAUDE.md');
  const expected = registry.skills.map((skill) => {
    const relative = folder + '/skills/' + skill.skill_id + '/SKILL.md';
    const file = safePath(target, relative);
    const bytes = fs.readFileSync(safePath(release.root, 'adapters/' + platform + '/' + skill.skill_id + '/SKILL.md'));
    if (fs.existsSync(file) && !fs.readFileSync(file).equals(bytes)) fail('CONFLICT', relative);
    if (!fs.existsSync(file) && fs.existsSync(path.dirname(file))) fail('CONFLICT', 'partial skill directory');
    return { id: skill.skill_id, file, bytes, relative };
  });
  const block = policyBlock(release, platform, gateCommand);
  const before = fs.existsSync(policyFile) ? fs.readFileSync(policyFile) : Buffer.alloc(0);
  const text = before.toString('utf8');
  if (text.includes(start) && (!text.endsWith(block + '\n') || text.split(start).length !== 2)) fail('POLICY_CONFLICT');
  const already = text.includes(start);
  if (!already && before.length && !approvedPolicyHashes.includes(digest(before))) fail('POLICY_REVIEW');
  const after = already ? before : Buffer.concat([before, Buffer.from((before.length ? '\n\n' : '') + block + '\n')]);
  // Inspect the actual destination with the existing installer before writing.
  execFileSync(process.execPath, ['scripts/install-skills.mjs', '--platform', platform,
    '--scope', 'project', '--project-root', target, '--dry-run'], { cwd: release.root, stdio: 'pipe' });
  const dir = safePath(target, folder);
  fs.mkdirSync(dir, { recursive: true });
  const lock = safePath(target, folder + '/.ush-bootstrap.lock');
  const fd = await acquireLock(lock);
  let stage;
  try {
    const current = fs.existsSync(policyFile) ? fs.readFileSync(policyFile) : Buffer.alloc(0);
    if (!current.equals(before) && !current.equals(after)) fail('POLICY_CONFLICT', 'concurrent edit');
    for (const item of expected) {
      safePath(target, item.relative);
      if (fs.existsSync(item.file) && !fs.readFileSync(item.file).equals(item.bytes)) fail('CONFLICT', item.relative);
    }
    const missing = expected.filter((item) => !fs.existsSync(item.file));
    if (missing.length) {
      stage = fs.mkdtempSync(path.join(dir, '.ush-stage-'));
      for (const mode of ['--dry-run', '--apply']) execFileSync(process.execPath, ['scripts/install-skills.mjs', '--platform', platform, '--scope', 'project', '--project-root', stage, mode], { cwd: release.root, stdio: 'pipe' });
      for (const item of expected) if (!fs.readFileSync(path.join(stage, item.relative)).equals(item.bytes)) fail('INSTALL_PARITY', item.id);
      for (const item of missing) {
        const parent = safePath(target, path.dirname(item.relative));
        if (fs.existsSync(parent)) fail('CONFLICT', 'concurrent directory');
        fs.mkdirSync(safePath(target, folder + '/skills'), { recursive: true });
        fs.renameSync(path.dirname(path.join(stage, item.relative)), parent);
      }
    }
    let policyChanged = 0;
    if (!current.equals(after)) {
      const temp = path.join(dir, '.ush-policy-' + crypto.randomUUID());
      fs.writeFileSync(temp, after, { flag: 'wx' });
      const final = fs.existsSync(policyFile) ? fs.readFileSync(policyFile) : Buffer.alloc(0);
      if (!final.equals(current)) fail('POLICY_CONFLICT', 'edit before commit');
      fs.renameSync(temp, policyFile);
      policyChanged = 1;
    }
    for (const item of expected) if (!fs.readFileSync(item.file).equals(item.bytes)) fail('INSTALL_PARITY', item.id);
    return { ready: true, pin: release.pin, changed: missing.length + policyChanged, skills: expected.map((x) => ({ id: x.id, sha256: digest(x.bytes) })), enforcement: 'ADVISORY' };
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(lock); // Only this invocation's exclusively-created lock.
    if (stage) fs.rmSync(stage, { recursive: true, force: true }); // Unique owned staging.
  }
}

export async function bridgeEligibility(release, input) {
  const registry = verifyRelease(release);
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_TASK');
  if (input.skillId === null) return { decision: 'SKIP', reasonCode: 'NO_CANDIDATE', enforcement: 'ADVISORY' };
  const skill = registry.skills.find((entry) => entry.skill_id === input.skillId);
  if (!skill || !input.task || typeof input.task.platform !== 'string') fail('INVALID_TASK');
  const { evaluateEligibility } = await import(pathToFileURL(path.join(release.root, 'scripts/eligibility.mjs')));
  const result = evaluateEligibility({ skill, task: input.task, conflicts: json(path.join(release.root, 'registry/conflicts.json')).conflicts, projectPolicy: input.projectPolicy ?? null });
  return { ...result, enforcement: 'ADVISORY' };
}

export async function launch({ executable, args, prepare, cwd = process.cwd(), env = process.env }) {
  if (!path.isAbsolute(executable) || !fs.existsSync(executable)) fail('EXECUTABLE');
  if (!(args.length === 1 && ['--help', '-h', '--version', '-V'].includes(args[0]))) await prepare();
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, env, stdio: 'inherit', shell: false });
    const forward = (signal) => { if (process.platform !== 'win32') child.kill(signal); };
    const onInt = () => forward('SIGINT'); const onTerm = () => forward('SIGTERM');
    process.on('SIGINT', onInt); process.on('SIGTERM', onTerm);
    const cleanup = () => { process.off('SIGINT', onInt); process.off('SIGTERM', onTerm); };
    child.once('error', (error) => { cleanup(); reject(error); });
    child.once('exit', (code, signal) => { cleanup(); resolve(code ?? (signal === 'SIGINT' ? 130 : 143)); });
  });
}
