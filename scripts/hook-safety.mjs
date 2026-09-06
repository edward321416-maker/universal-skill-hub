import fs from 'node:fs';
import url from 'node:url';

/**
 * Regression guard for the 2026-09-05 incident: a global Claude Code
 * PreToolUse hook pointed at a specific project checkout's absolute path
 * (synthetic example shape: `X:/Users/example/Desktop/deleted-project/.claude/hooks/guard.py`
 * — the real incident path is not reproduced here since this repository is
 * public). When that project directory was deleted, the hook command failed
 * on every single Bash/PowerShell call, blocking shell access entirely for
 * every other project on the machine.
 *
 * Invariant (see docs/DESIGN.md): user/global Claude configuration MUST NOT
 * reference a project-specific absolute checkout path for a required hook.
 * Safe patterns: a stable home-relative dotfile path (~/.claude/..., a
 * %USERPROFILE%/$env:USERPROFILE expansion into a dotfile dir), or a
 * project-relative path resolved by the harness itself. Unsafe pattern: an
 * absolute path that reaches into a Desktop/dev/projects/repos-style
 * directory and then into a further project-name subfolder — i.e. a
 * specific checkout that can be moved, renamed, or deleted independently of
 * Claude Code's own configuration.
 */
const PROJECT_CHECKOUT_PATTERN =
  /[A-Za-z]:[\\/]Users[\\/][^\\/"'\s]+[\\/](Desktop|Documents|dev|projects|repos)[\\/][^\\/"'\s]+[\\/]/i;

function extractCommands(hooksConfig) {
  const commands = [];
  for (const [event, matchers] of Object.entries(hooksConfig || {})) {
    for (const matcherEntry of matchers || []) {
      for (const hook of matcherEntry.hooks || []) {
        if (hook.type === 'command' && typeof hook.command === 'string') {
          commands.push({ event, matcher: matcherEntry.matcher || null, command: hook.command });
        }
      }
    }
  }
  return commands;
}

export function lintHookConfig(settings) {
  const violations = [];
  for (const { event, matcher, command } of extractCommands(settings && settings.hooks)) {
    const match = command.match(PROJECT_CHECKOUT_PATTERN);
    if (match) {
      violations.push({ event, matcher, command, matchedPath: match[0] });
    }
  }
  return { safe: violations.length === 0, violations };
}

function runCli() {
  const settingsPath = process.argv[2];
  if (!settingsPath) {
    console.error('usage: node scripts/hook-safety.mjs <path-to-settings.json>');
    process.exit(2);
  }
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const result = lintHookConfig(settings);
  if (result.safe) {
    console.log(`OK: no project-checkout-absolute-path hooks found in ${settingsPath}`);
    process.exit(0);
  }
  console.error(`FAIL: ${result.violations.length} unsafe hook(s) in ${settingsPath}:`);
  for (const v of result.violations) {
    console.error(`  - [${v.event}] matched "${v.matchedPath}" in: ${v.command}`);
  }
  process.exit(1);
}

if (process.argv[1] && import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  runCli();
}
