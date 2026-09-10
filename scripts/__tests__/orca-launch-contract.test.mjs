import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const moduleUrl = new URL('../orca-bootstrap.mjs', import.meta.url).href;
const childCode = `import fs from 'node:fs';
  const input = fs.readFileSync(0, 'utf8');
  process.stdout.write(JSON.stringify({args:process.argv.slice(1),input})+'\\n');
  process.stderr.write('child-stderr\\n'); process.exitCode=7;`;

test('synthetic native child preserves argv, stdin, stdout JSONL, stderr and failure exit', () => {
  const args = ['한글 space', 'quote"value', '$dollar; & literal', 'back\\slash', 'resume', 'fork'];
  const runner = `import {launch} from ${JSON.stringify(moduleUrl)};
    process.exitCode=await launch({executable:process.execPath,
      args:['--input-type=module','-e',${JSON.stringify(childCode)},'--',...process.argv.slice(1)],
      prepare:async()=>({ready:true})});`;
  const result = spawnSync(process.execPath,['--input-type=module','-e',runner,'--',...args],
    {input:'input 한글\n{"second":true}\n',encoding:'utf8',timeout:15000});
  assert.equal(result.status,7,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout),{args,input:'input 한글\n{"second":true}\n'});
  assert.equal(result.stdout.trim().split('\n').length,1);
  assert.equal(result.stderr,'child-stderr\n');
});

test('preparation rejection prevents synthetic native child output or first input consumption', () => {
  const runner = `import {launch} from ${JSON.stringify(moduleUrl)};
    try { await launch({executable:process.execPath,
      args:['--input-type=module','-e',${JSON.stringify(childCode)}],
      prepare:async()=>{throw new Error('INTEGRITY');}}); }
    catch(e){process.stderr.write(e.message);process.exitCode=19;}`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',runner],{input:'not delivered',encoding:'utf8',timeout:15000});
  assert.equal(result.status,19);
  assert.equal(result.stdout,'');
  assert.equal(result.stderr,'INTEGRITY');
});
