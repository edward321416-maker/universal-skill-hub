import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { load } from 'js-yaml';
import { evaluateEligibility } from './eligibility.mjs';
import { safePath, digest } from './orca-bootstrap.mjs';
import { commitPlacement } from './scoping-transaction.mjs';

const fail = (code) => { throw new Error(code); };
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const idValid = id => typeof id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
const read = file => { try { return fs.readFileSync(file); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
const kinds = { input: 'availableInputs', tool: 'availableTools', capability: 'availableCapabilities', permission: 'grantedPermissions' };
const restrictedReasons = new Set(['EXPERIMENTAL_L3_AUTO', 'L3_NO_EXPLICIT_INTENT', 'L3_NO_PERMISSION', 'L4_AUTO', 'L4_NO_INFORMED_CONFIRMATION']);

// Startup considers machine-checkable availability, never invents task intent.
// RESTRICTED is a placement candidate, NOT an authorization to execute it.
export function scopeProject({ registry, project, conflicts = [] }) {
  if (!project?.identity || !project.runtime || !project.policy || !Array.isArray(registry?.skills)) fail('INVALID_PROJECT_CONTEXT');
  const policy = project.policy;
  if (typeof policy !== 'object' || Array.isArray(policy)) fail('INVALID_PROJECT_POLICY');
  const policyKeys = ['enabledSkillIds', 'allowedSkillIds', 'blockedSkillIds', 'deniedOperations', 'protectedResources', 'maxCandidates', 'maxDescriptionBytes', 'denyAll', 'reason'];
  if (Object.keys(policy).some(k => !policyKeys.includes(k))) fail('UNKNOWN_PROJECT_POLICY');
  if (policy.denyAll !== undefined && typeof policy.denyAll !== 'boolean') fail('INVALID_PROJECT_POLICY');
  for (const key of ['availableInputs', 'availableTools', 'availableCapabilities', 'grantedPermissions', 'selectedSkillIds', 'requestedOperations', 'targetResources']) {
    if (project[key] !== undefined && (!Array.isArray(project[key]) || project[key].some(v => typeof v !== 'string'))) fail('INVALID_PROJECT_CONTEXT');
  }
  for (const key of ['enabledSkillIds', 'allowedSkillIds', 'blockedSkillIds', 'deniedOperations', 'protectedResources']) {
    if (policy[key] !== undefined && (!Array.isArray(policy[key]) || policy[key].some(v => typeof v !== 'string'))) fail('INVALID_PROJECT_POLICY');
  }
  if (project.budgetSignal?.overflowObserved != null && typeof project.budgetSignal.overflowObserved !== 'boolean') fail('INVALID_BUDGET_SIGNAL');
  for (const key of ['maxCandidates', 'maxDescriptionBytes']) {
    if (policy[key] !== undefined && (!Number.isSafeInteger(policy[key]) || policy[key] < 0)) fail('INVALID_BUDGET_POLICY');
  }
  const counts = new Map();
  for (const s of registry.skills) {
    if (!idValid(s.skill_id)) fail('INVALID_SKILL_ID');
    counts.set(s.skill_id, (counts.get(s.skill_id) || 0) + 1);
  }
  const excluded = [], candidates = [];
  const metrics = { hubSkillsTotal: registry.skills.length, projectCandidates: 0, materializedHubSkills: null, candidateReductionRatio: null,
    requirementsExcluded: 0, policyExcluded: 0, runtimeExcluded: 0, scopeExcluded: 0, budgetExcluded: 0,
    unmanagedPreserved: null, visibilityConfirmed: null, visibilityUnknown: null, overflowObserved: project.budgetSignal?.overflowObserved ?? null };
  const reject = (s, category, reason) => { excluded.push({ skill_id: s.skill_id, category, reason }); metrics[category]++; };
  const task = { platform: project.runtime, project: project.project_scope, autoInvoke: true, explicitIntent: false, hasPermission: false,
    availableInputs: project.availableInputs ?? [], availableTools: project.availableTools ?? [], availableCapabilities: project.availableCapabilities ?? [],
    grantedPermissions: project.grantedPermissions ?? [],
    // Startup has no selected task or target operation. These gates remain in
    // evaluateEligibility for the actual task; placement grants no permission.
    selectedSkillIds: [], requestedOperations: [], targetResources: [] };
  for (const s of registry.skills) {
    if (counts.get(s.skill_id) > 1) { reject(s, 'policyExcluded', 'DUPLICATE_ID'); continue; }
    if (!['global', 'domain', 'project'].includes(s.scope) || (s.scope === 'project' && !s.project_scope)) { reject(s, 'scopeExcluded', 'UNKNOWN_OR_INCOMPLETE_SCOPE'); continue; }
    const rt = s.runtime_support?.[project.runtime];
    if (!s.platforms?.includes(project.runtime) || s.runtime_exclusions?.[project.runtime] || !['SUPPORTED', 'SUPPORTED_WITH_RESTRICTIONS'].includes(rt?.status)) {
      reject(s, 'runtimeExcluded', 'RUNTIME_UNSUPPORTED_OR_UNKNOWN'); continue;
    }
    if (s.project_scope && s.project_scope !== project.project_scope) { reject(s, 'scopeExcluded', 'PROJECT_SCOPE_MISMATCH'); continue; }
    if (policy.denyAll || policy.blockedSkillIds?.includes(s.skill_id) || (policy.allowedSkillIds && !policy.allowedSkillIds.includes(s.skill_id))) {
      reject(s, 'policyExcluded', 'PROJECT_POLICY'); continue;
    }
    // Domain applicability must be declared, not inferred from a prose description.
    if (s.scope === 'domain' && !policy.enabledSkillIds?.includes(s.skill_id) && !policy.allowedSkillIds?.includes(s.skill_id) && !(s.project_scope && s.project_scope === project.project_scope)) {
      reject(s, 'scopeExcluded', 'DOMAIN_NOT_EXPLICITLY_SCOPED'); continue;
    }
    if ((rt.requires_at_runtime ?? []).some(r => !kinds[r.kind] || !task[kinds[r.kind]].includes(r.id))) {
      reject(s, 'requirementsExcluded', 'RUNTIME_REQUIREMENT_MISSING'); continue;
    }
    const result = evaluateEligibility({ skill: s, task, conflicts, projectPolicy: policy });
    if (result.decision !== 'USE' && !restrictedReasons.has(result.reasonCode)) {
      const category = result.reasonCode.startsWith('MISSING_') ? 'requirementsExcluded' : 'policyExcluded';
      reject(s, category, result.reasonCode); continue;
    }
    // Eligibility's high-risk early return must not hide lifecycle exclusion.
    if (['QUARANTINED', 'DEPRECATED'].includes(s.status)) { reject(s, 'policyExcluded', s.status); continue; }
    if (!['L0', 'L1', 'L2', 'L3', 'L4'].includes(s.risk)) { reject(s, 'policyExcluded', 'UNKNOWN_RISK'); continue; }
    if (s.description === undefined) { reject(s, 'budgetExcluded', 'DESCRIPTION_UNVERIFIED'); continue; }
    const description = s.description;
    if (typeof description !== 'string') fail('INVALID_DESCRIPTION');
    candidates.push({ ...s, description, state: result.decision === 'USE' ? 'CANDIDATE' : 'RESTRICTED', restriction: result.decision === 'USE' ? null : result.reasonCode });
  }
  const rank = s => [policy.enabledSkillIds?.includes(s.skill_id) ? 0 : 1, s.project_scope === project.project_scope && s.project_scope ? 0 : 1,
    s.runtime_support[project.runtime].status === 'SUPPORTED' ? 0 : 1, s.state === 'CANDIDATE' ? 0 : 1, s.scope === 'domain' ? 0 : 1];
  candidates.sort((a, b) => { const x = rank(a), y = rank(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return compare(a.skill_id, b.skill_id); });
  let bytes = 0, characters = 0;
  const selected = [];
  for (const s of candidates) {
    const size = Buffer.byteLength(s.description);
    if (selected.length >= (policy.maxCandidates ?? Infinity) || bytes + size > (policy.maxDescriptionBytes ?? Infinity)) { reject(s, 'budgetExcluded', 'PROJECT_BUDGET_POLICY'); continue; }
    selected.push(s); bytes += size; characters += [...s.description].length;
  }
  metrics.projectCandidates = selected.length;
  metrics.candidateReductionRatio = registry.skills.length ? 1 - selected.length / registry.skills.length : null;
  // External visibility observations belong to a separately bound runtime receipt.
  // A local calculation or caller-provided count must never confirm visibility.
  return { project: project.identity, runtime: project.runtime, candidates: selected,
    excluded: excluded.sort((a, b) => compare(a.skill_id, b.skill_id) || compare(a.reason, b.reason)), metrics,
    budget: { descriptionBytes: bytes, descriptionCharacters: characters, runtimeLimit: null,
      status: metrics.overflowObserved === true ? 'BLOCKED_OVERFLOW' : 'UNVERIFIED',
      policyLimit: { candidates: policy.maxCandidates ?? null, descriptionBytes: policy.maxDescriptionBytes ?? null } } };
}

// Native canonical bodies have no adapter banner. The sidecar binds the same
// ownership dimensions (skill ID + platform) plus an exact preimage hash, as in
// bootstrap rollback. Existing copies without this receipt are never adopted.
export function reconcileProject({ sourceRoot, targetRoot, registry, project, conflicts = [], apply = false, confirmRemoval = false }) {
  if (typeof apply !== 'boolean' || typeof confirmRemoval !== 'boolean') fail('INVALID_CONFIRMATION');
  const root = safePath(targetRoot), source = safePath(sourceRoot);
  const folder = { 'claude-code': '.claude', codex: '.agents' }[project.runtime];
  if (!folder) fail('UNSUPPORTED_LOCAL_PLACEMENT');
  if (fs.existsSync(safePath(root, folder + '/.ush-project-scope.pending.json'))) fail('RECOVERY_REQUIRED');
  const receiptFile = safePath(root, folder + '/.ush-project-scope.json');
  const receiptBytes = read(receiptFile);
  const receipt = receiptBytes ? JSON.parse(receiptBytes) : { owner: 'universal-skill-hub', version: 1, platform: project.runtime, project: project.identity, files: {} };
  if (receipt.owner !== 'universal-skill-hub' || receipt.version !== 1 || receipt.platform !== project.runtime || receipt.project !== project.identity || !receipt.files || typeof receipt.files !== 'object' || Array.isArray(receipt.files)) fail('INVALID_OWNERSHIP_RECEIPT');
  // Account from verified canonical frontmatter, never an empty registry field.
  const preliminary = scopeProject({ registry: { ...registry, skills: registry.skills.map(s => ({ ...s, description: '' })) }, project: { ...project, policy: { ...project.policy, maxCandidates: undefined, maxDescriptionBytes: undefined } }, conflicts });
  const descriptions = new Map(preliminary.candidates.map(s => {
    const body = read(safePath(source, s.path + '/SKILL.md'));
    if (!body || digest(body) !== s.content_sha256) fail('CANONICAL_INTEGRITY: ' + s.skill_id);
    const header = body.toString('utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const metadata = header ? load(header[1]) : null;
    if (!metadata || metadata.name !== s.skill_id || typeof metadata.description !== 'string' || !metadata.description.trim()) fail('INVALID_CANONICAL_METADATA');
    return [s.skill_id, metadata.description];
  }));
  const report = scopeProject({ registry: { ...registry, skills: registry.skills.map(s => descriptions.has(s.skill_id) ? { ...s, description: descriptions.get(s.skill_id) } : s) }, project, conflicts });
  const desired = new Map(report.candidates.map(s => [s.skill_id, s]));
  const dir = safePath(root, folder + '/skills');
  const siblings = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  report.metrics.unmanagedPreserved = siblings.filter(id => !Object.hasOwn(receipt.files, id)).length;
  const actions = [], next = {};
  for (const id of [...new Set([...Object.keys(receipt.files), ...desired.keys()])].sort(compare)) {
    if (!idValid(id)) fail('INVALID_SKILL_ID');
    const relative = folder + '/skills/' + id + '/SKILL.md';
    const file = safePath(root, relative), old = read(file), previousHash = receipt.files[id];
    if (previousHash !== undefined && !/^[a-f0-9]{64}$/.test(previousHash)) fail('INVALID_OWNERSHIP_RECEIPT');
    if (previousHash && (!old || digest(old) !== previousHash)) fail('CONFLICT: ' + id);
    if (!previousHash && (old || fs.existsSync(path.dirname(file)))) fail('UNMANAGED: ' + id);
    if (previousHash && fs.readdirSync(path.dirname(file)).some(name => name !== 'SKILL.md')) fail('CONFLICT_EXTRA_FILES: ' + id);
    const s = desired.get(id);
    if (!s) { actions.push({ id, action: 'remove', file, before: old, after: null }); continue; }
    const canonical = read(safePath(source, s.path + '/SKILL.md'));
    if (!canonical || digest(canonical) !== s.content_sha256) fail('CANONICAL_INTEGRITY: ' + id);
    // Supporting-file distribution needs a tree ownership receipt first.
    if (fs.readdirSync(safePath(source, s.path)).some(name => name !== 'SKILL.md')) fail('UNSUPPORTED_SUPPORTING_FILES: ' + id);
    next[id] = s.content_sha256;
    actions.push({ id, action: old ? old.equals(canonical) ? 'unchanged' : 'update' : 'create', file, before: old, after: canonical });
  }
  report.actions = actions.map(({ id, action }) => ({ id, action }));
  report.metrics.materializedHubSkills = actions.filter(a => a.before !== null && a.action !== 'create').length;
  if (!apply) return report;
  if (report.metrics.overflowObserved === true) fail('BLOCKED_OVERFLOW');
  if (actions.some(a => a.action === 'remove') && !confirmRemoval) fail('REMOVAL_CONFIRMATION_REQUIRED');
  const parent = safePath(root, folder); fs.mkdirSync(parent, { recursive: true });
  const lock = safePath(root, folder + '/.ush-project-scope.lock');
  const fd = fs.openSync(lock, 'wx');
  try {
    commitPlacement({ root, folder, receiptFile, receiptBytes, actions, nextReceipt: JSON.stringify({ ...receipt, files: next }, null, 2) + '\n' });
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
  report.metrics.materializedHubSkills = Object.keys(next).length;
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  // Read-only CLI. Applying is an explicit API integration, never a startup hook.
  const [contextFile] = process.argv.slice(2);
  if (!contextFile || process.argv.length !== 3) fail('USAGE: node scripts/project-scoping.mjs <project-context.json>');
  const registry = JSON.parse(fs.readFileSync('registry/skills-index.json', 'utf8'));
  for (const s of registry.skills) {
    const body = fs.readFileSync(safePath(process.cwd(), s.path + '/SKILL.md'));
    if (digest(body) !== s.content_sha256) fail('CANONICAL_INTEGRITY');
    const frontmatter = body.toString('utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
    s.description = frontmatter ? load(frontmatter[1]).description : '';
  }
  const project = JSON.parse(fs.readFileSync(contextFile, 'utf8'));
  const conflicts = JSON.parse(fs.readFileSync('registry/conflicts.json', 'utf8')).conflicts;
  console.log(JSON.stringify(scopeProject({ registry, project, conflicts }), null, 2));
}
