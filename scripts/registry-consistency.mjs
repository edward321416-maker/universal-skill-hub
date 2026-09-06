import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import url from 'node:url';
import { load as loadYaml } from 'js-yaml';
import { VALID_BUNDLE_TARGETS } from './bundle-targets.mjs';
import { isKnownVocabId, isKnownRequirement, VALID_REQUIREMENT_KINDS } from './runtime-vocabulary.mjs';

const VALID_RUNTIME_SUPPORT_STATUSES = ['SUPPORTED', 'SUPPORTED_WITH_RESTRICTIONS'];
const VALID_RUNTIME_EXCLUSION_STATUSES = ['UNSUPPORTED', 'UNVERIFIED'];
const VALID_EVIDENCE_SOURCE_TYPES = ['official_docs', 'official_runtime_test', 'local_runtime_test'];
const VERIFIED_ON_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidVerifiedOn(value) {
  if (typeof value !== 'string' || !VERIFIED_ON_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Validates a `runtime_support`/`runtime_exclusions` entry's provenance:
 * `reason` (non-empty), `evidence` (non-empty array of {source_type, source,
 * verified_on}), and — for runtime_support only — typed `requires_at_runtime`
 * entries resolving into the central runtime-requirements vocabulary. See
 * docs/DESIGN.md's "Runtime compatibility model" section.
 */
function validateRuntimeEntry({ label, skillId, runtimeKey, entry, allowedStatuses, statusLabel, checkRequiresAtRuntime }, errors) {
  if (!allowedStatuses.includes(entry.status)) {
    errors.push(`${label}["${runtimeKey}"].status "${entry.status}" is not one of ${allowedStatuses.join('|')} — ${statusLabel}`);
  }
  if (!entry.reason || String(entry.reason).trim() === '') {
    errors.push(`${label}["${runtimeKey}"] is missing a "reason"`);
  }
  if (!Array.isArray(entry.evidence) || entry.evidence.length === 0) {
    errors.push(`${label}["${runtimeKey}"] is missing "evidence" — every runtime_support/runtime_exclusions entry must carry re-checkable provenance`);
  } else {
    for (const ev of entry.evidence) {
      if (!VALID_EVIDENCE_SOURCE_TYPES.includes(ev.source_type)) {
        errors.push(`${label}["${runtimeKey}"] evidence has unknown source_type "${ev.source_type}" — must be one of ${VALID_EVIDENCE_SOURCE_TYPES.join('|')}`);
      }
      if (!ev.source || String(ev.source).trim() === '') {
        errors.push(`${label}["${runtimeKey}"] evidence is missing "source"`);
      }
      if (!isValidVerifiedOn(ev.verified_on)) {
        errors.push(`${label}["${runtimeKey}"] evidence has invalid "verified_on" ("${ev.verified_on}") — must be YYYY-MM-DD`);
      }
    }
  }

  if (checkRequiresAtRuntime && entry.requires_at_runtime !== undefined) {
    if (!Array.isArray(entry.requires_at_runtime)) {
      errors.push(`${label}["${runtimeKey}"].requires_at_runtime must be an array of {kind, id}`);
    } else {
      const seen = new Set();
      for (const req of entry.requires_at_runtime) {
        const dedupeKey = `${req && req.kind}:${req && req.id}`;
        if (seen.has(dedupeKey)) {
          errors.push(`${label}["${runtimeKey}"].requires_at_runtime has a duplicate {kind: "${req.kind}", id: "${req.id}"} entry`);
        }
        seen.add(dedupeKey);
        if (!VALID_REQUIREMENT_KINDS.includes(req.kind)) {
          errors.push(`${label}["${runtimeKey}"].requires_at_runtime has an unknown kind "${req.kind}" — must be one of ${VALID_REQUIREMENT_KINDS.join('|')}`);
        } else if (!isKnownRequirement(req.kind, req.id)) {
          errors.push(`${label}["${runtimeKey}"].requires_at_runtime references unknown ${req.kind} "${req.id}" — not found in registry/runtime-requirements.json (wrong namespace or typo)`);
        }
      }
    }
  }
}

/** Validates a plain string array (required_capabilities/permissions/tools, or an operationGates list) against one vocabulary namespace. */
function validateVocabRefs({ label, namespaceKey, ids }, errors) {
  for (const id of ids || []) {
    if (!isKnownVocabId(namespaceKey, id)) {
      errors.push(`${label} references unknown identifier "${id}" — not found in registry/runtime-requirements.json's "${namespaceKey}" namespace (typo, or wrong namespace)`);
    }
  }
}

/**
 * Field ownership (see docs/DESIGN.md "Registry <-> canonical consistency"):
 *
 * Canonical-source-owned (registry/skills-index.json must mirror these
 * exactly; if they drift apart it is a bug, not a legitimate override):
 *   - skill_id      <- canonical frontmatter `name`
 *   - version       <- canonical frontmatter `metadata.version`
 *   - scope         <- canonical frontmatter `metadata.scope`
 *   - risk          <- canonical frontmatter `metadata.risk`
 *   - status        <- canonical frontmatter `metadata.status`
 *
 * Derived, not owned by either side (must equal a fresh computation):
 *   - content_sha256 <- sha256 of the canonical SKILL.md file's exact bytes
 *
 * Registry-owned (no canonical-source equivalent; the registry is the only
 * source of truth for these):
 *   - path, source_repo, source_path, source_commit
 *   - platforms: registry-owned, but only as a backward-compatible MIRROR
 *     of runtime_support — see below
 *   - runtime_support: registry-owned, AUTHORITATIVE runtime compatibility
 *   - runtime_exclusions: registry-owned, sparse evidence-backed negative/
 *     unverified runtime assessment
 *   - bundle_targets: registry-owned distribution/packaging metadata,
 *     independent of runtime_support (see docs/DESIGN.md)
 *
 * The central runtime-requirements vocabulary (registry/runtime-
 * requirements.json) is authoritative for every capability/permission/tool
 * identifier referenced anywhere in the registry (required_capabilities,
 * required_permissions, required_tools, operationGates.*, and typed
 * requires_at_runtime entries).
 */
export function checkConsistency({ registryEntry, canonicalContent }) {
  const errors = [];
  const match = canonicalContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const frontmatter = match ? loadYaml(match[1]) || {} : {};
  const metadata = frontmatter.metadata || {};

  if (frontmatter.name !== registryEntry.skill_id) {
    errors.push(`registry skill_id "${registryEntry.skill_id}" does not match canonical frontmatter name "${frontmatter.name}"`);
  }
  if (metadata.version !== registryEntry.version) {
    errors.push(`registry version "${registryEntry.version}" does not match canonical metadata.version "${metadata.version}"`);
  }
  if (metadata.scope !== registryEntry.scope) {
    errors.push(`registry scope "${registryEntry.scope}" does not match canonical metadata.scope "${metadata.scope}"`);
  }
  if (metadata.risk !== registryEntry.risk) {
    errors.push(`registry risk "${registryEntry.risk}" does not match canonical metadata.risk "${metadata.risk}"`);
  }
  if (metadata.status !== registryEntry.status) {
    errors.push(`registry status "${registryEntry.status}" does not match canonical metadata.status "${metadata.status}"`);
  }

  const actualHash = crypto.createHash('sha256').update(canonicalContent).digest('hex');
  if (actualHash !== registryEntry.content_sha256) {
    errors.push(`registry content_sha256 "${registryEntry.content_sha256}" does not match the canonical file's actual hash "${actualHash}"`);
  }

  const VALID_BUNDLE_STATUSES = ['SUPPORTED', 'SUPPORTED_WITH_RESTRICTIONS', 'UNSUPPORTED'];
  const bundleTargets = registryEntry.bundle_targets;
  if (bundleTargets) {
    for (const [target, entry] of Object.entries(bundleTargets)) {
      if (!VALID_BUNDLE_TARGETS.includes(target)) {
        errors.push(`bundle_targets key "${target}" is not a known bundle target — must be one of ${VALID_BUNDLE_TARGETS.join('|')}`);
      }
      if (!VALID_BUNDLE_STATUSES.includes(entry.status)) {
        errors.push(`bundle_targets["${target}"].status "${entry.status}" is not one of ${VALID_BUNDLE_STATUSES.join('|')}`);
      }
      if (!entry.reason || String(entry.reason).trim() === '') {
        errors.push(`bundle_targets["${target}"] is missing a "reason" — a support/restriction/unsupported claim must be explained, not just asserted`);
      }
    }

    // Completeness: a skill that opts into declaring bundle_targets at all
    // must declare every known target explicitly (even if UNSUPPORTED) —
    // so a target is never silently forgotten. bundle_targets itself
    // remains optional; this only fires once a skill has at least one entry.
    for (const knownTarget of VALID_BUNDLE_TARGETS) {
      if (!(knownTarget in bundleTargets)) {
        errors.push(`bundle_targets is missing an entry for known target "${knownTarget}" — a skill that declares bundle_targets must declare all of ${VALID_BUNDLE_TARGETS.join('|')}, even if UNSUPPORTED`);
      }
    }

    // Typed requires_at_runtime entries (same {kind, id} shape as
    // runtime_support) are validated against the same central vocabulary,
    // so a bundle_targets requirement can never drift into an identifier
    // runtime_support doesn't also recognize.
    for (const [target, entry] of Object.entries(bundleTargets)) {
      if (!Array.isArray(entry.requires_at_runtime)) continue;
      for (const req of entry.requires_at_runtime) {
        if (typeof req === 'string') continue; // legacy untyped form, not re-validated here
        if (!VALID_REQUIREMENT_KINDS.includes(req.kind)) {
          errors.push(`bundle_targets["${target}"].requires_at_runtime has an unknown kind "${req.kind}"`);
        } else if (!isKnownRequirement(req.kind, req.id)) {
          errors.push(`bundle_targets["${target}"].requires_at_runtime references unknown ${req.kind} "${req.id}"`);
        }
      }
    }
  }

  // --- Runtime compatibility model (Phase 1.2 review round 4) ---
  // See docs/DESIGN.md's "Runtime compatibility model" section for the
  // full definitions: runtime_support is authoritative, platforms is its
  // backward-compatible mirror, runtime_exclusions is sparse evidence-
  // backed negative/unverified assessment.
  const runtimeSupport = registryEntry.runtime_support;
  const runtimeExclusions = registryEntry.runtime_exclusions;

  if (runtimeSupport) {
    for (const [platform, entry] of Object.entries(runtimeSupport)) {
      validateRuntimeEntry(
        {
          label: 'runtime_support',
          skillId: registryEntry.skill_id,
          runtimeKey: platform,
          entry,
          allowedStatuses: VALID_RUNTIME_SUPPORT_STATUSES,
          statusLabel: 'runtime_support may only contain SUPPORTED or SUPPORTED_WITH_RESTRICTIONS — a negative/unverified assessment belongs in runtime_exclusions instead',
          checkRequiresAtRuntime: true,
        },
        errors
      );
    }

    const platforms = registryEntry.platforms || [];
    const platformSet = new Set(platforms);
    const supportKeySet = new Set(Object.keys(runtimeSupport));
    for (const platform of platformSet) {
      if (!supportKeySet.has(platform)) {
        errors.push(`platforms includes "${platform}" but runtime_support has no entry for it — platforms must mirror runtime_support exactly (set equality, order-independent)`);
      }
    }
    for (const key of supportKeySet) {
      if (!platformSet.has(key)) {
        errors.push(`runtime_support declares "${key}" but platforms does not include it — platforms must mirror runtime_support exactly (set equality, order-independent)`);
      }
    }
  }

  if (runtimeExclusions) {
    for (const [platform, entry] of Object.entries(runtimeExclusions)) {
      validateRuntimeEntry(
        {
          label: 'runtime_exclusions',
          skillId: registryEntry.skill_id,
          runtimeKey: platform,
          entry,
          allowedStatuses: VALID_RUNTIME_EXCLUSION_STATUSES,
          statusLabel: 'runtime_exclusions may only contain UNSUPPORTED or UNVERIFIED — a positive assessment belongs in runtime_support instead',
          checkRequiresAtRuntime: false,
        },
        errors
      );
    }
  }

  if (runtimeSupport && runtimeExclusions) {
    const overlap = Object.keys(runtimeSupport).filter((k) => Object.prototype.hasOwnProperty.call(runtimeExclusions, k));
    for (const key of overlap) {
      errors.push(`"${key}" appears in both runtime_support and runtime_exclusions — a runtime cannot be simultaneously supported and excluded`);
    }
  }

  // --- Central runtime-requirements vocabulary, reused across every field
  // whose semantics match capabilities/permissions/tools (Phase 1.2 review
  // round 4, item 9) ---
  validateVocabRefs({ label: 'required_capabilities', namespaceKey: 'capabilities', ids: registryEntry.required_capabilities }, errors);
  validateVocabRefs({ label: 'required_permissions', namespaceKey: 'permissions', ids: registryEntry.required_permissions }, errors);
  validateVocabRefs({ label: 'required_tools', namespaceKey: 'tools', ids: registryEntry.required_tools }, errors);
  for (const [opName, gate] of Object.entries(registryEntry.operationGates || {})) {
    validateVocabRefs({ label: `operationGates["${opName}"].requiredCapabilities`, namespaceKey: 'capabilities', ids: gate.requiredCapabilities }, errors);
    validateVocabRefs({ label: `operationGates["${opName}"].requiredPermissions`, namespaceKey: 'permissions', ids: gate.requiredPermissions }, errors);
  }

  return { consistent: errors.length === 0, errors };
}

function runCli() {
  const registry = JSON.parse(fs.readFileSync(path.join('registry', 'skills-index.json'), 'utf8'));
  let errorCount = 0;

  for (const skill of registry.skills) {
    const canonicalContent = fs.readFileSync(path.join(skill.path, 'SKILL.md'), 'utf8');
    const result = checkConsistency({ registryEntry: skill, canonicalContent });
    if (!result.consistent) {
      for (const e of result.errors) {
        console.error(`INCONSISTENT: ${skill.skill_id}: ${e}`);
        errorCount += 1;
      }
    }
  }

  console.log(`checked ${registry.skills.length} registry entr${registry.skills.length === 1 ? 'y' : 'ies'}, ${errorCount} inconsistency/-ies.`);
  process.exit(errorCount > 0 ? 1 : 0);
}

if (process.argv[1] && import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  runCli();
}
