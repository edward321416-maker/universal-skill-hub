import fs from 'node:fs';
import path from 'node:path';

/**
 * Single source of truth for runtime-requirement identifiers (capabilities,
 * permissions, tools), loaded from registry/runtime-requirements.json —
 * see docs/DESIGN.md's "Runtime requirements: central vocabulary" section.
 * Every `required_capabilities`/`required_permissions`/`required_tools`,
 * `operationGates[*].requiredCapabilities`/`requiredPermissions`, and typed
 * `requires_at_runtime` entry across the registry must resolve into this
 * vocabulary — an unlisted identifier is a typo or an invented requirement,
 * not a legitimate one, and registry-consistency.mjs fails closed on it.
 */
export const RUNTIME_REQUIREMENTS = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'registry', 'runtime-requirements.json'), 'utf8')
);

export const REQUIREMENT_KIND_TO_NAMESPACE = {
  capability: 'capabilities',
  permission: 'permissions',
  tool: 'tools',
};

export const VALID_REQUIREMENT_KINDS = Object.keys(REQUIREMENT_KIND_TO_NAMESPACE);

/** Is `id` a known identifier in the vocabulary namespace `namespaceKey` (capabilities|permissions|tools)? */
export function isKnownVocabId(namespaceKey, id) {
  return Boolean(RUNTIME_REQUIREMENTS[namespaceKey] && Object.prototype.hasOwnProperty.call(RUNTIME_REQUIREMENTS[namespaceKey], id));
}

/** Is `id` a known identifier under the given typed `kind` (capability|permission|tool)? */
export function isKnownRequirement(kind, id) {
  const namespaceKey = REQUIREMENT_KIND_TO_NAMESPACE[kind];
  if (!namespaceKey) return false;
  return isKnownVocabId(namespaceKey, id);
}
