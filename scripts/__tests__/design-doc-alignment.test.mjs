import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Regression guard: docs/DESIGN.md's eligibility check-order list went
 * stale once already in Phase 1.2 (it omitted project scope mismatch,
 * required-field checks, and per-operation gates entirely — added to the
 * engine across Phase 1.1/1.2 without the doc being updated). This test
 * extracts every reasonCode string scripts/eligibility.mjs can actually
 * emit and fails if docs/DESIGN.md doesn't mention it, so a new reasonCode
 * added to the engine without a doc update breaks the build instead of
 * silently drifting.
 */
test('every reasonCode scripts/eligibility.mjs can emit is mentioned in docs/DESIGN.md', () => {
  const engineSource = fs.readFileSync(path.join(process.cwd(), 'scripts', 'eligibility.mjs'), 'utf8');
  const designDoc = fs.readFileSync(path.join(process.cwd(), 'docs', 'DESIGN.md'), 'utf8');

  const reasonCodes = [...engineSource.matchAll(/reasonCode:\s*'([A-Z0-9_]+)'/g)].map((m) => m[1]);
  assert.ok(reasonCodes.length > 10, 'sanity check: expected to find a substantial number of reasonCode literals in eligibility.mjs');

  const missing = [...new Set(reasonCodes)].filter((code) => !designDoc.includes(code));
  assert.deepEqual(missing, [], `docs/DESIGN.md is missing these reasonCodes emitted by scripts/eligibility.mjs: ${missing.join(', ')}`);
});
