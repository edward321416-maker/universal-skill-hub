import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveContext, deploy, bridgeEligibility, launch, safePath, digest, formatShellCommand } from './orca-bootstrap.mjs';

// Operator-owned host-local config, never project-supplied executable definitions.
// This CLI is NOT automatically registered with ORCA by installing these files.
const [mode, configPath, ...args] = process.argv.slice(2);
let stage = 'config';
let inventoryCommand = null;
let engineEntered = false;
async function main() {
  if (!['prepare', 'gate', 'run'].includes(mode) || !configPath || !path.isAbsolute(configPath)) {
    throw new Error('Usage: orca-launcher.mjs <prepare|gate|run> <absolute-config.json> [native argv...]');
  }
  const config = JSON.parse(fs.readFileSync(safePath(configPath), 'utf8'));
  if (config.version !== 1 || !path.isAbsolute(config.orcaExecutable)) throw new Error('CONFIG_INVALID');
  const release = JSON.parse(fs.readFileSync(safePath(config.releaseManifest), 'utf8'));
  if (release.pin !== config.pin) throw new Error('PIN_MISMATCH');
  const inventory = command => {
    inventoryCommand = command;
    stage = 'cwd-preflight';
    if (!fs.statSync(process.cwd()).isDirectory()) throw new Error('CWD_NOT_DIRECTORY');
    stage = 'orca-preflight';
    // existsSync hides EPERM as false; preserve the actual filesystem failure.
    if (!fs.statSync(config.orcaExecutable).isFile()) throw new Error('EXECUTABLE_NOT_FILE');
    stage = 'orca-spawn';
    const output = execFileSync(config.orcaExecutable, [command, 'list', '--json'], { encoding: 'utf8', timeout: 15000 });
    stage = 'orca-json';
    const response = JSON.parse(output);
    stage = 'inventory';
    if (!response.ok || response.result.truncated || response.result.hostScope?.omittedHostIds?.length) throw new Error('INCOMPLETE_INVENTORY');
    return response.result;
  };
  const context = () => {
    const repos = inventory('repo').repos;
    const worktrees = inventory('worktree').worktrees;
    stage = 'enrollment';
    return resolveContext({ cwd: process.cwd(), repos, worktrees,
      allowedRepoIds: config.allowedRepoIds, allowedOwners: config.allowedOwners });
  };
  if (mode === 'gate') {
    context();
    stage = 'task-input';
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    stage = 'eligibility';
    engineEntered = true;
    const result = await bridgeEligibility(release, input);
    console.log(JSON.stringify(result));
    return result.decision === 'BLOCK' ? 2 : 0;
  }
  const prepare = async () => {
    const ctx = context();
    const canonicalConfig = safePath(configPath);
    const commandPrefix = (process.platform === 'win32' ? '& ' : '') + JSON.stringify(process.execPath) + ' ' + JSON.stringify(fileURLToPath(import.meta.url)) + ' gate ';
    const gateCommand = formatShellCommand([process.execPath, fileURLToPath(import.meta.url), 'gate', canonicalConfig]);
    // Retain exact previously installed blocks for either Windows separator
    // spelling. These alternatives are derived here, never read from project data.
    const legacyGateCommands = [commandPrefix + JSON.stringify(canonicalConfig),
      ...(process.platform === 'win32' ? [commandPrefix + JSON.stringify(canonicalConfig.replaceAll('\\', '/'))] : [])];
    stage = 'preparation';
    const result = await deploy({ release, ...ctx, platform: 'codex', gateCommand, legacyGateCommands,
      approvedPolicyHashes: [...(config.approvedPolicyHashes?.[ctx.target] ?? []),
        ...(config.approvedRepoPolicyHashes?.[ctx.repoId] ?? [])] });
    const receiptDir = safePath(config.receiptDirectory);
    fs.mkdirSync(receiptDir, { recursive: true });
    const receipt = { timestamp: new Date().toISOString(), ...ctx, ...result,
      scope: 'deployment-only', modelVisibility: 'NOT_TESTED', skillLoad: 'NOT_TESTED', automaticSelection: 'NOT_TESTED' };
    fs.writeFileSync(path.join(receiptDir, digest(Buffer.from(ctx.target)) + '-' + Date.now() + '.json'), JSON.stringify(receipt, null, 2), { flag: 'wx' });
    console.error(JSON.stringify({ ready: result.ready, changed: result.changed, pin: result.pin, enforcement: result.enforcement }));
    return result;
  };
  if (mode === 'prepare') { await prepare(); return 0; }
  if (!config.nativeExecutable || path.resolve(config.nativeExecutable) === fileURLToPath(import.meta.url)) throw new Error('EXECUTABLE_RECURSION');
  // Existing ORCA defaults are not silently copied, rewritten, or globally enabled.
  return launch({ executable: config.nativeExecutable, args, prepare });
}
main().then(code => { process.exitCode = code; }).catch(error => {
  const label = error.message?.split(':')[0];
  console.error(JSON.stringify({ error: 'USH_PREPARATION_FAILED', stage,
    command: inventoryCommand, engineEntered,
    code: error.code ?? (/^[A-Z_]+$/.test(label) ? label : 'RUNTIME_ERROR'),
    errno: error.errno ?? null, syscall: error.syscall?.split(' ')[0] ?? null,
    status: error.status ?? null, childStderrPresent: Boolean(error.stderr?.length) }));
  process.exitCode = 1;
});
