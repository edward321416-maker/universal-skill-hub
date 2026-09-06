import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintHookConfig } from '../hook-safety.mjs';

test('regression: a synthetic reproduction of the 2026-09-05 incident shape (a deleted project checkout absolute path) is flagged', () => {
  // Synthetic path — the real incident's machine-specific path is not
  // reproduced here since this repository is public. Shape matches: a
  // drive-letter absolute path into Users/<name>/Desktop/<project-name>/....
  const settings = {
    hooks: {
      PreToolUse: [
        {
          matcher: 'Bash|PowerShell',
          hooks: [{ type: 'command', command: 'py X:/Users/example/Desktop/deleted-project/.claude/hooks/guard.py' }],
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
