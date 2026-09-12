import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Quota-free installed app-server protocol: initialize + skills/list only.
// No threads, turns, models, accounts, or auth methods are requested.
const [entry, cwd, output] = process.argv.slice(2);
if (!entry || !cwd || !output || !path.isAbsolute(entry) || !path.isAbsolute(cwd)) throw new Error('Usage: node scripts/codex-skill-inventory.mjs <absolute-codex.js> <absolute-cwd> <output.json>');
const child = spawn(process.execPath, [entry, 'app-server', '-c', 'sandbox_mode="read-only"'], { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
let buffer = '', stderr = '', settled = false;
const send = value => child.stdin.write(JSON.stringify(value) + '\n');
const done = new Promise((resolve, reject) => {
  child.on('error', reject);
  child.stderr.on('data', data => { stderr += data; });
  child.stdout.on('data', data => {
    buffer += data;
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      if (!line.trim()) continue;
      let row; try { row = JSON.parse(line); } catch { continue; }
      if (row.id === 1) {
        if (row.error) { reject(new Error(JSON.stringify(row.error))); return; }
        send({ method: 'initialized', params: {} });
        send({ id: 2, method: 'skills/list', params: { cwds: [cwd], forceReload: true } });
      } else if (row.id === 2) {
        settled = true;
        if (row.error) reject(new Error(JSON.stringify(row.error)));
        else resolve(row.result);
      }
    }
  });
  child.on('exit', code => { if (!settled) reject(new Error('APP_SERVER_EXIT: ' + code)); });
});
const timer = setTimeout(() => child.kill(), 30000);
try {
  send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'ush-decision17-diagnostic', version: '1.0.0' } } });
  const result = await done;
  fs.writeFileSync(output, JSON.stringify({ observedAt: new Date().toISOString(), method: 'skills/list', cwd, result, stderr }, null, 2) + '\n');
  console.log(JSON.stringify({ output, resultKeys: Object.keys(result) }));
} finally { clearTimeout(timer); child.kill(); }
