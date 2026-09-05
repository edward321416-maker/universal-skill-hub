import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintHookConfig } from '../hook-safety.mjs';

test('regression: the exact broken hook from the 2026-09-05 incident (a deleted project checkout absolute path) is flagged', () => {
  const settings = {
    hooks: {
      PreToolUse: [
        {
          matcher: 'Bash|PowerShell',
          hooks: [{ type: 'command', command: 'py D:/Users/admin/Desktop/s12d_agent/.claude/hooks/guard.py' }],
        },
      ],
    },
  };
  const result = lintHookConfig(settings);
  assert.equal(result.safe, false);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].event, 'PreToolUse');
});

test('a hook pointing at a stable home-relative dotfile location (~/.claude/hooks/...) is not flagged', () => {
  const settings = {
    hooks: {
      PreToolUse: [
        { hooks: [{ type: 'command', command: 'py ~/.claude/hooks/guard.py' }] },
      ],
    },
  };
  const result = lintHookConfig(settings);
  assert.equal(result.safe, true);
  assert.deepEqual(result.violations, []);
});

test('a hook using %USERPROFILE% / $env:USERPROFILE expansion into a stable dotfile dir is not flagged', () => {
  const settings = {
    hooks: {
      SessionStart: [
        { hooks: [{ type: 'command', command: 'powershell.exe -Command "& $env:USERPROFILE\\.orca\\agent-hooks\\claude-hook.cmd"' }] },
      ],
    },
  };
  const result = lintHookConfig(settings);
  assert.equal(result.safe, true);
});

test('a hook pointing into a Desktop/dev/repos-style project checkout under a different drive is also flagged', () => {
  const settings = {
    hooks: {
      PostToolUse: [
        { hooks: [{ type: 'command', command: 'node C:/Users/someone/dev/my-other-project/.claude/hooks/check.js' }] },
      ],
    },
  };
  const result = lintHookConfig(settings);
  assert.equal(result.safe, false);
  assert.equal(result.violations[0].event, 'PostToolUse');
});

test('a settings object with no hooks at all is trivially safe', () => {
  const result = lintHookConfig({});
  assert.equal(result.safe, true);
  assert.deepEqual(result.violations, []);
});
