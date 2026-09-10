import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import * as bootstrap from '../orca-bootstrap.mjs';
test('generated command preserves literal shell metacharacters and Unicode',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"ush 한글 $ ' "));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const script=path.join(root,'echo.cjs');
 fs.writeFileSync(script,"process.stdout.write(JSON.stringify(process.argv.slice(2)).replace(/[\\u007f-\\uffff]/g,c=>'\\\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')))");
 const args=['gate',"space 한글 ' apostrophe",'back\\slash','$env:USERNAME; $(exit 99)', '`tick'];
 if(process.platform==='win32')assert.throws(()=>bootstrap.formatShellCommand(['illegal"path']),/UNSUPPORTED_WINDOWS_PATH_QUOTE/);
 else args.push('"quote"');
 const command=bootstrap.formatShellCommand([process.execPath,script,...args]);
 const win=process.platform==='win32';
 const r=spawnSync(win?'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe':'/bin/sh',win?['-NoProfile','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')]:['-c',command],{encoding:'utf8',timeout:10000});
 assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),args);
});
