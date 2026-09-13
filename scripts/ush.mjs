#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { reconcileProject } from './project-scoping.mjs';

const fail = code => { throw new Error(code); };
const sourceRoot = fileURLToPath(new URL('../', import.meta.url));

try {
  const argv = process.argv.slice(2);
  if (argv.length !== 1 || argv[0] !== 'prepare') fail('USAGE: ush prepare');

  let gitRoot;
  try {
    gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    fail('NOT_A_GIT_PROJECT');
  }
  const targetRoot = fs.realpathSync.native(gitRoot);
  const registry = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'registry/skills-index.json'), 'utf8'));
  const conflicts = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'registry/conflicts.json'), 'utf8')).conflicts;
  const receiptFile = path.join(targetRoot, '.agents', '.ush-project-scope.json');

  let identity = 'ush-auto-' + createHash('sha256').update(targetRoot).digest('hex').slice(0, 16);
  if (fs.existsSync(receiptFile)) {
    const receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
    if (receipt.owner === 'universal-skill-hub' && receipt.version === 1 && receipt.platform === 'codex' && typeof receipt.project === 'string' && receipt.project) {
      identity = receipt.project;
    }
  }

  const project = {
    identity,
    project_scope: identity,
    runtime: 'codex',
    policy: { allowedSkillIds: ['ush-repo-evidence-plan'] },
    availableInputs: ['repository'],
    availableTools: [],
    availableCapabilities: [],
    grantedPermissions: [],
  };
  const input = { sourceRoot, targetRoot, registry, conflicts, project };
  const preview = reconcileProject(input);
  if (preview.actions.some(({ action }) => action === 'remove')) fail('ADVANCED_SCOPE_PRESENT: use prepare-project');
  const report = reconcileProject({ ...input, apply: true });
  const changed = report.actions.some(({ action }) => action === 'create' || action === 'update');
  console.log(changed ? `Prepared ${report.metrics.materializedHubSkills} Skill for Codex in ${targetRoot}` : `Already prepared for Codex in ${targetRoot}`);
} catch (error) {
  console.error(error.code || error.message);
  process.exitCode = 1;
}
