import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRoutingMetrics } from '../routing-eval.mjs';

// Phase 1.3: routing eval harness. This measures HOST semantic-routing
// behavior (recorded separately, e.g. from a live Codex session) against
// expected skill candidates — it does not replace or simulate the router.
// A case with `actualSkillIds: null` means "not yet observed" and must be
// excluded from precision/recall (not silently coerced to a wrong answer).
//
// Phase 1.3 methodology lock: a live Codex session on this machine proved
// (via the quota-free `codex debug prompt-input` diagnostic) that all six
// Hub skills are NOT model-visible in the real, unmodified environment —
// crowded out by ~330 unrelated third-party skills sharing the same
// user-level skill root. Recording that as an ordinary false negative would
// conflate "the router looked and rejected it" with "the router never saw
// it at all." Every case with a non-empty `expectedSkillIds` must therefore
// declare `modelVisible` explicitly:
//   - true:  the expected skill(s) were confirmed model-visible; the case
//            is routing-evaluable and contributes to TP/FP/FN normally.
//   - false: the expected skill was structurally unreachable — a
//            REACHABILITY FAILURE, not a semantic false negative. Excluded
//            entirely from precision/recall.
//   - null:  visibility was not established — VISIBILITY UNKNOWN. Also
//            excluded from precision/recall.
// A positive-expected case with no `modelVisible` field at all is a
// migration bug (silently-assumed reachability), not a valid "unknown" —
// computeRoutingMetrics rejects it outright rather than guessing.
// Negative cases (`expectedSkillIds: []`) have no expected skill whose
// visibility needs establishing, so `modelVisible` is optional for them
// and never affects the reachability counters.

test('an exact match (expected == actual), reachable, contributes only to TP, no FP/FN', () => {
  const result = computeRoutingMetrics([
    { id: 'c1', task: 't', expectedSkillIds: ['ush-repo-evidence-plan'], actualSkillIds: ['ush-repo-evidence-plan'], modelVisible: true },
  ]);
  assert.equal(result.summary.tp, 1);
  assert.equal(result.summary.fp, 0);
  assert.equal(result.summary.fn, 0);
  assert.equal(result.summary.precision, 1);
  assert.equal(result.summary.recall, 1);
  assert.equal(result.summary.casesReachable, 1);
});

test('an unexpected extra selection, reachable, is a false positive', () => {
  const result = computeRoutingMetrics([
    { id: 'c1', task: 't', expectedSkillIds: ['ush-repo-evidence-plan'], actualSkillIds: ['ush-repo-evidence-plan', 'ush-game-meeting-plan'], modelVisible: true },
  ]);
  assert.equal(result.summary.tp, 1);
  assert.equal(result.summary.fp, 1);
  assert.equal(result.summary.fn, 0);
});

test('REGRESSION 3: a missed expected skill, reachable (modelVisible=true), is a genuine false negative', () => {
  const result = computeRoutingMetrics([
    { id: 'c1', task: 't', expectedSkillIds: ['ush-repo-evidence-plan'], actualSkillIds: [], modelVisible: true },
  ]);
  assert.equal(result.summary.tp, 0);
  assert.equal(result.summary.fp, 0);
  assert.equal(result.summary.fn, 1);
  assert.equal(result.summary.casesReachable, 1);
  assert.equal(result.summary.casesUnreachable, 0);
});

test('REGRESSION 1: a missed expected skill, UNREACHABLE (modelVisible=false), is NOT a false negative — it is a reachability failure, excluded from precision/recall', () => {
  const result = computeRoutingMetrics([
    { id: 'c1', task: 't', expectedSkillIds: ['ush-repo-evidence-plan'], actualSkillIds: [], modelVisible: false },
  ]);
  assert.equal(result.summary.fn, 0, 'must not count toward fn');
  assert.equal(result.summary.tp, 0);
  assert.equal(result.summary.fp, 0);
  assert.equal(result.summary.casesUnreachable, 1);
  assert.equal(result.summary.casesReachable, 0);
  assert.equal(result.summary.precision, null);
  assert.equal(result.summary.recall, null);
  const c = result.cases[0];
  assert.equal(c.modelVisible, false);
  assert.equal(c.reachabilityFailure, true);
  assert.equal(c.routingEvaluable, false);
});

test('REGRESSION 2: modelVisible=null (visibility unknown) is excluded from routing metrics and counted as visibility-unknown, not reachable or unreachable', () => {
  const result = computeRoutingMetrics([
    { id: 'c1', task: 't', expectedSkillIds: ['ush-repo-evidence-plan'], actualSkillIds: null, modelVisible: null },
  ]);
  assert.equal(result.summary.casesVisibilityUnknown, 1);
  assert.equal(result.summary.casesReachable, 0);
  assert.equal(result.summary.casesUnreachable, 0);
  assert.equal(result.summary.tp, 0);
  assert.equal(result.summary.fn, 0);
  assert.equal(result.summary.precision, null);
  assert.equal(result.summary.recall, null);
  const c = result.cases[0];
  assert.equal(c.modelVisible, null);
  assert.equal(c.routingEvaluable, false);
});

test('REGRESSION 4: a reachable exact match is TP (duplicate of the basic case, kept as the numbered regression the review asked for)', () => {
  const result = computeRoutingMetrics([
    { id: 'c1', task: 't', expectedSkillIds: ['ush-game-meeting-plan'], actualSkillIds: ['ush-game-meeting-plan'], modelVisible: true },
  ]);
  assert.equal(result.summary.tp, 1);
  assert.equal(result.summary.casesReachable, 1);
});

test('REGRESSION 5: a negative case with no skill selected is a true negative even when modelVisible is null', () => {
  const result = computeRoutingMetrics([{ id: 'c1', task: 'explain semver', expectedSkillIds: [], actualSkillIds: [], modelVisible: null }]);
  assert.equal(result.summary.tn, 1);
  assert.equal(result.summary.casesReachable, 0);
  assert.equal(result.summary.casesUnreachable, 0);
  assert.equal(result.summary.casesVisibilityUnknown, 0, 'negative cases must not inflate the reachability counters');
});

test('REGRESSION 6: a negative case with an unexpected skill selected is a false positive even when modelVisible is null', () => {
  const result = computeRoutingMetrics([{ id: 'c1', task: 'summarize this paragraph', expectedSkillIds: [], actualSkillIds: ['ush-game-meeting-plan'], modelVisible: null }]);
  assert.equal(result.summary.fp, 1);
  assert.equal(result.summary.tn, 0);
  assert.equal(result.summary.casesVisibilityUnknown, 0);
});

test('a correct negative case (no skill expected, none selected) counts as a true negative, not TP/FP/FN, and does not corrupt precision/recall', () => {
  const result = computeRoutingMetrics([
    { id: 'c1', task: 'explain semver', expectedSkillIds: [], actualSkillIds: [] },
    { id: 'c2', task: 't', expectedSkillIds: ['ush-repo-evidence-plan'], actualSkillIds: ['ush-repo-evidence-plan'], modelVisible: true },
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
    { id: 'c1', task: 't', expectedSkillIds: ['ush-repo-evidence-plan'], actualSkillIds: null, modelVisible: true },
    { id: 'c2', task: 't2', expectedSkillIds: ['ush-game-meeting-plan'], actualSkillIds: ['ush-game-meeting-plan'], modelVisible: true },
  ]);
  assert.equal(result.summary.casesTotal, 2);
  assert.equal(result.summary.casesObserved, 1);
  assert.equal(result.summary.casesNotObserved, 1);
  assert.equal(result.summary.tp, 1);
  const unobserved = result.cases.find((c) => c.id === 'c1');
  assert.equal(unobserved.observed, false);
  assert.equal(unobserved.tp, undefined);
});

test('REGRESSION 7: undefined denominators remain null (not NaN, not a fabricated number) when no cases have been observed at all', () => {
  const result = computeRoutingMetrics([{ id: 'c1', task: 't', expectedSkillIds: ['ush-repo-evidence-plan'], actualSkillIds: null, modelVisible: true }]);
  assert.equal(result.summary.precision, null);
  assert.equal(result.summary.recall, null);
});

test('precision is null (not 0 or NaN) when there are zero positive selections to judge (tp+fp=0) but recall may still be defined', () => {
  const result = computeRoutingMetrics([{ id: 'c1', task: 't', expectedSkillIds: ['ush-repo-evidence-plan'], actualSkillIds: [], modelVisible: true }]);
  assert.equal(result.summary.precision, null);
  assert.equal(result.summary.recall, 0);
});

test('raw per-case results are preserved (not collapsed into just the summary number)', () => {
  const result = computeRoutingMetrics([
    { id: 'c1', task: 't1', expectedSkillIds: ['ush-repo-evidence-plan'], actualSkillIds: ['ush-repo-evidence-plan'], modelVisible: true },
    { id: 'c2', task: 't2', expectedSkillIds: ['ush-game-meeting-plan'], actualSkillIds: [], modelVisible: true },
  ]);
  assert.equal(result.cases.length, 2);
  assert.deepEqual(result.cases[1].falseNegatives, ['ush-game-meeting-plan']);
});

test('REGRESSION 8: a positive-expected case with NO modelVisible field at all is rejected outright — silently assuming reachability is exactly the bug this schema exists to prevent', () => {
  assert.throws(
    () => computeRoutingMetrics([{ id: 'c1', task: 't', expectedSkillIds: ['ush-repo-evidence-plan'], actualSkillIds: ['ush-repo-evidence-plan'] }]),
    /modelVisible/
  );
});

test('a negative case with no modelVisible field at all does not throw (visibility is not applicable when nothing is expected)', () => {
  const result = computeRoutingMetrics([{ id: 'c1', task: 't', expectedSkillIds: [], actualSkillIds: [] }]);
  assert.equal(result.summary.tn, 1);
});

test('summary reachability counters sum correctly across a mixed batch of reachable/unreachable/unknown/negative cases', () => {
  const result = computeRoutingMetrics([
    { id: 'reachable-1', task: 't', expectedSkillIds: ['ush-repo-evidence-plan'], actualSkillIds: ['ush-repo-evidence-plan'], modelVisible: true },
    { id: 'unreachable-1', task: 't', expectedSkillIds: ['ush-github-task-flow'], actualSkillIds: [], modelVisible: false },
    { id: 'unknown-1', task: 't', expectedSkillIds: ['ush-work-announcement'], actualSkillIds: null, modelVisible: null },
    { id: 'negative-1', task: 't', expectedSkillIds: [], actualSkillIds: [] },
  ]);
  assert.equal(result.summary.casesTotal, 4);
  assert.equal(result.summary.casesReachable, 1);
  assert.equal(result.summary.casesUnreachable, 1);
  assert.equal(result.summary.casesVisibilityUnknown, 1);
  assert.equal(result.summary.tp, 1);
  assert.equal(result.summary.fn, 0);
  assert.equal(result.summary.tn, 1);
  assert.equal(result.summary.precision, 1);
  assert.equal(result.summary.recall, 1);
});
