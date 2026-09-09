import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveContext, deploy, bridgeEligibility, launch, safePath, digest } from './orca-bootstrap.mjs';

// Operator-owned host-local config, never project-supplied executable definitions.
// This CLI is NOT automatically registered with ORCA by installing these files.
const [mode, configPath, ...args] = process.argv.slice(2);
async function main() {
  if (!['prepare', 'gate', 'run'].includes(mode) || !configPath || !path.isAbsolute(configPath)) {
    throw new Error('Usage: orca-launcher.mjs <prepare|gate|run> <absolute-config.json> [native argv...]');
  }
  const config = JSON.parse(fs.readFileSync(safePath(configPath), 'utf8'));
  if (config.version !== 1 || !path.isAbsolute(config.orcaExecutable)) throw new Error('CONFIG_INVALID');
  const release = JSON.parse(fs.readFileSync(safePath(config.releaseManifest), 'utf8'));
  if (release.pin !== config.pin) throw new Error('PIN_MISMATCH');
  const inventory = command => {
    const response = JSON.parse(execFileSync(config.orcaExecutable, [command, 'list', '--json'], { encoding: 'utf8', timeout: 15000 }));
    if (!response.ok || response.result.truncated || response.result.hostScope?.omittedHostIds?.length) throw new Error('INCOMPLETE_INVENTORY');
    return response.result;
  };
  const context = () => resolveContext({ cwd: process.cwd(), repos: inventory('repo').repos,
    worktrees: inventory('worktree').worktrees, allowedRepoIds: config.allowedRepoIds,
    allowedOwners: config.allowedOwners });
  if (mode === 'gate') {
    context();
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    const result = await bridgeEligibility(release, input);
    console.log(JSON.stringify(result));
    return result.decision === 'BLOCK' ? 2 : 0;
  }
  const prepare = async () => {
    const ctx = context();
    const gateCommand = (process.platform === 'win32' ? '& ' : '') + JSON.stringify(process.execPath) + ' ' + JSON.stringify(fileURLToPath(import.meta.url)) + ' gate ' + JSON.stringify(configPath);
    const result = await deploy({ release, ...ctx, platform: 'codex', gateCommand,
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
  console.error('USH_PREPARATION_FAILED: ' + error.message);
  process.exitCode = 1;
});
