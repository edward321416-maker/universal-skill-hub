/**
 * forbidden_capabilities is the current field name in registry/compatibility.json
 * (capabilities the skill/task must never actually USE). It was previously
 * named requires_not; this accepts either so a not-yet-migrated entry keeps
 * working, but prefers the current name when both are present.
 */
export function getForbiddenCapabilities(compatibilityEntry) {
  if (!compatibilityEntry) return [];
  return compatibilityEntry.forbidden_capabilities || compatibilityEntry.requires_not || [];
}
