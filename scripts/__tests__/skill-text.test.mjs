import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cli=fileURLToPath(new URL('../read-skill-utf8.mjs',import.meta.url));
function fixture(t,bytes){const root=fs.mkdtempSync(path.join(os.tmpdir(),'ush-text-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const dir=path.join(root,'.agents/skills/ush-test');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'SKILL.md'),bytes);return root;}
test('reader preserves exact Unicode text through ASCII JSON transport',t=>{
 const text='ASCII 한글 — “smart” \\path\nline two\r\n';const bytes=Buffer.from(text,'utf8');const root=fixture(t,bytes);
 const r=spawnSync(process.execPath,[cli,'ush-test'],{cwd:root,encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/^[\x00-\x7f]*$/);
 const parsed=JSON.parse(r.stdout);assert.equal(parsed.content,text);assert.equal(parsed.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));
 // A structured log adds one JSON envelope, not another text decoding pass.
 assert.equal(JSON.parse(JSON.parse(JSON.stringify({output:r.stdout})).output).content,text);
 assert.deepEqual(fs.readFileSync(path.join(root,'.agents/skills/ush-test/SKILL.md')),bytes);
});
test('invalid UTF-8 and path escape fail without emitting a body',t=>{
 const root=fixture(t,Buffer.from([0xff]));
 for(const id of ['ush-test','../../outside']){const r=spawnSync(process.execPath,[cli,id],{cwd:root,encoding:'utf8'});assert.equal(r.status,1);assert.equal(r.stdout,'');assert.equal(JSON.parse(r.stderr).error,'SKILL_READ_FAILED');}
});
test('reader survives Windows PowerShell native output without code-page changes',{skip:process.platform!=='win32'},t=>{
 const text='한글 — “smart” \\path\n';const root=fixture(t,Buffer.from(text));
 const quote=s=>"'"+s.replaceAll("'","''")+"'";
 const command='& '+[process.execPath,cli,'ush-test'].map(quote).join(' ');
 const r=spawnSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoProfile','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{cwd:root,encoding:'utf8',timeout:10000});
 assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).content,text);
});
