// Bounded helpers for recorded PowerShell diagnostics, not a command parser or
// a permission gate. The original command is retained for reviewer inspection.
export function matchesSkillReadRecord(command, id, output) {
  const normalized = command.replace(/\\+/g, '/').toLowerCase();
  const installedPath = normalized.includes(`.agents/skills/${id.toLowerCase()}/skill.md`)
    || normalized.includes('.agents/skills/*/skill.md');
  return /Get-Content/i.test(command) && installedPath && output.includes('name: ' + id);
}

export function decodeRecordedText(text) {
  try {
    const value = JSON.parse(text);
    if (value && typeof value.chunk_id === 'string' && typeof value.output === 'string') return value.output;
  } catch { /* A plain tool text block needs no JSON decoding. */ }
  return text;
}

export function decodeRecordedBlocks(text) {
  try {
    const value = JSON.parse(text);
    if (Array.isArray(value) && value.every(v => v && typeof v.chunk_id === 'string' && typeof v.output === 'string')) return value.map(v => v.output);
  } catch { /* Preserve the original text when there is no envelope. */ }
  return [decodeRecordedText(text)];
}
