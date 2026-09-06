import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRoutingMetrics } from '../routing-eval.mjs';

// Phase 1.3: routing eval harness. This measures HOST semantic-routing
// behavior (recorded separately, e.g. from a live Codex session) against
// expected skill candidates — it does not replace or simulate the router.
// A case with `actualSkillIds: null` means "not yet observed" and must be
// excluded from precision/recall (not silently coerced to a wrong answer).

test('an exact match (expected == actual) contributes only to TP, no FP/FN', () => {
  const result = computeRoutingMetrics([
    { id: 'c1', task: 't', expectedSkillIds: ['ush-repo-evidence-plan'], actualSkillIds: ['ush-repo-evidence-plan'] },
  ]);
  assert.equal(result.summary.tp, 1);
  assert.equal(result.summary.fp, 0);
  assert.equal(result.summary.fn, 0);
  assert.equal(result.summary.precision, 1);
  assert.equal(result.summary.recall, 1);
});

test('an unexpected extra selection is a false positive', () => {
  const result = computeRoutingMetrics([
    { id: 'c1', task: 't', expectedSkillIds: ['ush-repo-evidence-plan'], actualSkillIds: ['ush-repo-evidence-plan', 'ush-game-meeting-plan'] },
  ]);
  assert.equal(result.summary.tp, 1);
  assert.equal(result.summary.fp, 1);
  assert.equal(result.summary.fn, 0);
});

test('a missed expected skill is a false negative', () => {
  const result = computeRoutingMetrics([
    { id: 'c1', task: 't', expectedSkillIds: ['ush-repo-evidence-plan'], actualSkillIds: [] },
  ]);
  assert.equal(result.summary.tp, 0);
  assert.equal(result.summary.fp, 0);
  assert.equal(result.summary.fn, 1);
});

test('a correct negative case (no skill expected, none selected) counts as a true negative, not TP/FP/FN, and does not corrupt precision/recall', () => {
  const result = computeRoutingMetrics([
    { id: 'c1', task: 'explain semver', expectedSkillIds: [], actualSkillIds: [] },
    { id: 'c2', task: 't', expectedSkillIds: ['ush-repo-evidence-plan'], actualSkillIds: ['ush-repo-evidence-plan'] },
  ]);
  assert.equal(result.summary.tn, 1);
  assert.equal(result.summary.tp, 1);
  assert.equal(result.summary.fp, 0);
  assert.equal(result.summary.fn, 0);
  assert.equal(result.summary.precision, 1);
  assert.equal(result.summary.recall, 1);
});

test('an unnecessary invocation on a negative case (no skill expected, one selected) is a false positive', () => {
  const result = computeRoutingMetrics([{ id: 'c1', task: 'summarize this paragraph', expectedSkillIds: [], actualSkillIds: ['ush-game-meeting-plan'] }]);
  assert.equal(result.summary.tn, 0);
  assert.equal(result.summary.fp, 1);
});

test('a case with actualSkillIds: null is NOT OBSERVED and excluded from tp/fp/fn/precision/recall, but still appears per-case', () => {
  const result = computeRoutingMetrics([
    { id: 'c1', task: 't', expectedSkillIds: ['ush-repo-evidence-plan'], actualSkillIds: null },
    { id: 'c2', task: 't2', expectedSkillIds: ['ush-game-meeting-plan'], actualSkillIds: ['ush-game-meeting-plan'] },
  ]);
  assert.equal(result.summary.casesTotal, 2);
  assert.equal(result.summary.casesObserved, 1);
  assert.equal(result.summary.casesNotObserved, 1);
  assert.equal(result.summary.tp, 1);
  const unobserved = result.cases.find((c) => c.id === 'c1');
  assert.equal(unobserved.observed, false);
  assert.equal(unobserved.tp, undefined);
});

test('undefined denominators are reported as null, not NaN or a fabricated number, when no cases have been observed at all', () => {
  const result = computeRoutingMetrics([{ id: 'c1', task: 't', expectedSkillIds: ['ush-repo-evidence-plan'], actualSkillIds: null }]);
  assert.equal(result.summary.precision, null);
  assert.equal(result.summary.recall, null);
});

test('precision is null (not 0 or NaN) when there are zero positive selections to judge (tp+fp=0) but recall may still be defined', () => {
  const result = computeRoutingMetrics([{ id: 'c1', task: 't', expectedSkillIds: ['ush-repo-evidence-plan'], actualSkillIds: [] }]);
  assert.equal(result.summary.precision, null);
  assert.equal(result.summary.recall, 0);
});

test('raw per-case results are preserved (not collapsed into just the summary number)', () => {
  const result = computeRoutingMetrics([
    { id: 'c1', task: 't1', expectedSkillIds: ['ush-repo-evidence-plan'], actualSkillIds: ['ush-repo-evidence-plan'] },
    { id: 'c2', task: 't2', expectedSkillIds: ['ush-game-meeting-plan'], actualSkillIds: [] },
  ]);
  assert.equal(result.cases.length, 2);
  assert.deepEqual(result.cases[1].falseNegatives, ['ush-game-meeting-plan']);
});
