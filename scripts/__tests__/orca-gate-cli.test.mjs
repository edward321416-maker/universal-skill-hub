import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createManifest } from '../orca-bootstrap.mjs';

const source=fileURLToPath(new URL('../../',import.meta.url));
const cli=path.join(source,'scripts/orca-launcher.mjs');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ush-gate-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const cache=path.join(root,'cache');fs.mkdirSync(cache);
 for(const n of ['scripts','registry','skills','adapters','node_modules','package.json','package-lock.json'])fs.cpSync(path.join(source,n),path.join(cache,n),{recursive:true});
 const pin='463446ae2372161dd9431c96bcb52bdfab024001';
 const manifest=path.join(root,'manifest.json');fs.writeFileSync(manifest,JSON.stringify(createManifest(cache,pin)));
 const configFile=path.join(root,'config.json');
 const config={version:1,pin,releaseManifest:manifest,orcaExecutable:process.execPath,allowedRepoIds:['test']};
 const data={repo:{repos:[{id:'test'}]},worktree:{worktrees:[{id:'wt',repoId:'test',path:root,hostId:'local'}],truncated:false,hostScope:{omittedHostIds:[]}}};
 // Node is the authorized fake executable; its repo/worktree entry scripts are
 // data-only fixture responses, not a mock of the eligibility module.
 const save=()=>{fs.writeFileSync(configFile,JSON.stringify(config));for(const n of ['repo','worktree'])fs.writeFileSync(path.join(root,n),`process.stdout.write(${JSON.stringify(JSON.stringify({ok:true,result:data[n]}))});`);};
 save();
 return {root,config,data,save,run:(input={skillId:null})=>spawnSync(process.execPath,[cli,'gate',configFile],{cwd:root,input:JSON.stringify(input),encoding:'utf8',timeout:20000})};
}
test('actual gate CLI executes fake ORCA inventory then the existing engine',t=>{
 const f=fixture(t);const r=f.run();assert.equal(r.status,0,r.stderr);assert.equal(r.stderr,'');assert.equal(JSON.parse(r.stdout).reasonCode,'NO_CANDIDATE');
 const blocked=f.run({skillId:'ush-github-task-flow',task:{platform:'codex'}});assert.equal(blocked.status,2);assert.equal(JSON.parse(blocked.stdout).reasonCode,'MISSING_CAPABILITY');
 const automatic=f.run({skillId:'ush-github-task-flow',task:{platform:'codex',autoInvoke:true,explicitIntent:true,hasPermission:true,availableCapabilities:['github_write'],grantedPermissions:['github_write']}});assert.equal(automatic.status,2);assert.equal(JSON.parse(automatic.stdout).reasonCode,'EXPERIMENTAL_L3_AUTO');
});
test('missing executable emits stage-specific JSON diagnostic, not an engine decision',t=>{
 const f=fixture(t);f.config.orcaExecutable=path.join(f.root,'missing.exe');f.save();const r=f.run();
 assert.equal(r.status,1);assert.equal(r.stdout,'');const error=JSON.parse(r.stderr);assert.equal(error.stage,'orca-preflight');assert.equal(error.code,'ENOENT');assert.equal(error.engineEntered,false);
});
test('missing caller cwd fails before CLI creation',t=>{
 const f=fixture(t);const r=spawnSync(process.execPath,[cli,'gate',path.join(f.root,'config.json')],{cwd:path.join(f.root,'missing-cwd'),input:'{}',encoding:'utf8'});
 assert.equal(r.status,null);assert.equal(r.error.code,'ENOENT');assert.ok(!r.stdout);
});
for(const scenario of ['invalid-json','partial','missing-repo','missing-worktree','wrong-host'])test('gate fails closed: '+scenario,t=>{
 const f=fixture(t);
 if(scenario==='partial')f.data.worktree.truncated=true;
 if(scenario==='missing-repo')f.data.repo.repos=[];
 if(scenario==='missing-worktree')f.data.worktree.worktrees=[];
 if(scenario==='wrong-host')f.data.worktree.worktrees[0].hostId='remote';
 f.save();if(scenario==='invalid-json')fs.writeFileSync(path.join(f.root,'repo'),'process.stdout.write("not-json");');
 const r=f.run();assert.equal(r.status,1);assert.equal(r.stdout,'');assert.equal(JSON.parse(r.stderr).engineEntered,false);
});
