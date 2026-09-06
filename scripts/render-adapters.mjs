import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import url from 'node:url';

export const ADAPTER_TARGETS = {
  codex: (skillId) => `.agents/skills/${skillId}/SKILL.md`,
  'claude-code': (skillId) => `.claude/skills/${skillId}/SKILL.md`,
  cursor: (skillId) => `.cursor/skills/${skillId}/SKILL.md`,
  opencode: (skillId) => `.opencode/skills/${skillId}/SKILL.md`,
};

// Platforms with a filesystem skill-directory adapter implemented today.
// chatgpt/claude-ai use an export-bundle strategy instead (see adapters/*/README.md)
// and are deliberately excluded here — render-adapters.mjs and check-drift.mjs
// both use this list so they never disagree about which platforms are "done".
export const FILESYSTEM_ADAPTER_PLATFORMS = Object.keys(ADAPTER_TARGETS);

const DEFAULT_PLATFORM_CAPABILITIES = {
  // shell_exec: all four are agentic CLIs/IDE-integrated agents with real
  // shell/bash tool access by design, so a skill needing to run git/gh
  // commands is genuinely supported here — this is a static platform
  // capability, distinct from a dynamic per-task capability like
  // "github_write" (whether THIS run's provider is actually authenticated
  // for writes), which eligibility.mjs checks per-task instead.
  codex: ['native_skill_deployment', 'read_files', 'search_symbols', 'shell_exec'],
  'claude-code': ['native_skill_deployment', 'read_files', 'search_symbols', 'shell_exec'],
  cursor: ['native_skill_deployment', 'read_files', 'search_symbols', 'shell_exec'],
  opencode: ['native_skill_deployment', 'read_files', 'search_symbols', 'shell_exec'],
  chatgpt: ['instruction_export', 'read_files'],
  'claude-ai': ['instruction_export', 'read_files'],
};

export function renderAdapter({ skillId, canonicalBody, platform, capabilities, platformCapabilities, sourceCommit }) {
  const platCaps = (platformCapabilities || DEFAULT_PLATFORM_CAPABILITIES)[platform] || [];
  const requires = (capabilities && capabilities.requires) || [];
  const missing = requires.filter((cap) => !platCaps.includes(cap));

  if (missing.length > 0) {
    return {
      blocked: true,
      reason: `platform "${platform}" does not support required capability/capabilities: ${missing.join(', ')}`,
    };
  }

  const targetFn = ADAPTER_TARGETS[platform];
  const targetPath = targetFn ? targetFn(skillId) : `adapters/${platform}/${skillId}/SKILL.md`;
  const contentHash = crypto.createHash('sha256').update(canonicalBody).digest('hex');

  const marker = [
    '<!--',
    'GENERATED — DO NOT EDIT',
    `Rendered from canonical skill "${skillId}" for platform "${platform}".`,
    `canonical_content_sha256: ${contentHash}`,
    sourceCommit ? `source_commit: ${sourceCommit}` : null,
    'Edit the canonical SKILL.md under skills/ and re-run scripts/render-adapters.mjs instead.',
    '-->',
  ].filter(Boolean).join('\n');

  // The marker must NOT precede the frontmatter delimiter: a real live
  // Codex session (Phase 1.3) proved Codex's own skill loader requires the
  // file to start with "---" as its literal first bytes, rejecting every
  // Hub skill with "missing YAML frontmatter delimited by ---" when the
  // marker (an HTML comment) came first. Insert the marker immediately
  // after the closing "---" of the frontmatter block instead, so `---` is
  // always byte 0 regardless of platform.
  const frontmatterMatch = canonicalBody.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n)([\s\S]*)$/);
  const content = frontmatterMatch
    ? `${frontmatterMatch[1]}\n${marker}\n${frontmatterMatch[2]}`
    : `${marker}\n\n${canonicalBody}`; // no frontmatter found — fall back to the old shape rather than corrupt the file

  return {
    blocked: false,
    targetPath,
    contentHash,
    content,
  };
}

function runCli() {
  const registryPath = path.join('registry', 'skills-index.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const platforms = FILESYSTEM_ADAPTER_PLATFORMS;
  const compatibility = JSON.parse(fs.readFileSync(path.join('registry', 'compatibility.json'), 'utf8'));
  let wrote = 0;
  let blocked = 0;

  for (const skill of registry.skills) {
    const canonicalBody = fs.readFileSync(path.join(skill.path, 'SKILL.md'), 'utf8');
    const caps = (compatibility.skills && compatibility.skills[skill.skill_id]) || { requires: [], requires_not: [] };

    for (const platform of platforms) {
      if (!skill.platforms.includes(platform)) continue;
      const rendered = renderAdapter({
        skillId: skill.skill_id,
        canonicalBody,
        platform,
        capabilities: caps,
        sourceCommit: skill.source_commit,
      });

      if (rendered.blocked) {
        console.error(`BLOCK: ${skill.skill_id} on ${platform}: ${rendered.reason}`);
        blocked += 1;
        continue;
      }

      const outPath = path.join('adapters', platform, skill.skill_id, 'SKILL.md');
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, rendered.content);
      console.log(`OK: wrote ${outPath}`);
      wrote += 1;
    }
  }

  console.log(`\nrendered ${wrote} adapter file(s), ${blocked} blocked.`);
  process.exit(blocked > 0 && wrote === 0 ? 1 : 0);
}

if (process.argv[1] && import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  runCli();
}
