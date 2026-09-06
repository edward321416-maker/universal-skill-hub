import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCursorRoutingMetrics } from '../cursor-routing-eval.mjs';

// Phase 1.3 Cursor routing evidence: a SEPARATE evaluator from Codex's
// scripts/routing-eval.mjs. Cursor's uncertainty is not a "context-budget
// reachability" problem (Codex's `modelVisible`) — it is a "the model's own
// narrative claimed skill usage but no directly-observable runtime event
// (e.g. a readToolCall on the exact ~/.cursor/skills/<id>/SKILL.md path)
// corroborated it" problem. These are genuinely different kinds of
// uncertainty and must not share a field or be unified into one metric.
//
// selectionEvidence:
//   CONFIRMED   — actual selection is directly observable at runtime
//                 (e.g. a readToolCall on the exact skill file path).
//                 actualSkillIds must be a real, non-null array.
//   UNCONFIRMED — no direct runtime evidence exists (a model's own
//                 narrative claim ("Using ush-...") is NOT sufficient).
//                 Excluded entirely from TP/FP/FN/TN and from precision/
//                 recall — never silently treated as a false negative.
//   NOT_TESTED  — the case was never run. Also excluded from metrics.

test('a CONFIRMED exact positive match is a true positive', () => {
  const result = computeCursorRoutingMetrics([
    { id: 'c1', task: 't', expectedSkillIds: ['ush-repo-evidence-plan'], actualSkillIds: ['ush-repo-evidence-plan'], selectionEvidence: 'CONFIRMED' },
  ]);
  assert.equal(result.summary.tp, 1);
  assert.equal(result.summary.fp, 0);
  assert.equal(result.summary.fn, 0);
  assert.equal(result.summary.precision, 1);
  assert.equal(result.summary.recall, 1);
});

test('a CONFIRMED missed positive is a false negative', () => {
  const result = computeCursorRoutingMetrics([
    { id: 'c1', task: 't', expectedSkillIds: ['ush-repo-evidence-plan'], actualSkillIds: [], selectionEvidence: 'CONFIRMED' },
  ]);
  assert.equal(result.summary.fn, 1);
  assert.equal(result.summary.tp, 0);
});

test('a CONFIRMED unexpected skill selection is a false positive', () => {
  const result = computeCursorRoutingMetrics([
    { id: 'c1', task: 't', expectedSkillIds: ['ush-repo-evidence-plan'], actualSkillIds: ['ush-repo-evidence-plan', 'ush-game-meeting-plan'], selectionEvidence: 'CONFIRMED' },
  ]);
  assert.equal(result.summary.tp, 1);
  assert.equal(result.summary.fp, 1);
});

test('a CONFIRMED negative case with actualSkillIds=[] is a true negative', () => {
  const result = computeCursorRoutingMetrics([{ id: 'c1', task: 't', expectedSkillIds: [], actualSkillIds: [], selectionEvidence: 'CONFIRMED' }]);
  assert.equal(result.summary.tn, 1);
  assert.equal(result.summary.tp, 0);
  assert.equal(result.summary.fp, 0);
});

test('an UNCONFIRMED positive case is excluded from metrics entirely — NOT counted as a false negative', () => {
  const result = computeCursorRoutingMetrics([
    { id: 'c1', task: 't', expectedSkillIds: ['ush-repo-evidence-plan'], actualSkillIds: null, selectionEvidence: 'UNCONFIRMED' },
  ]);
  assert.equal(result.summary.fn, 0, 'must NOT count as fn');
  assert.equal(result.summary.tp, 0);
  assert.equal(result.summary.casesUnconfirmed, 1);
  const c = result.cases[0];
  assert.equal(c.routingEvaluable, false);
  assert.equal(c.selectionEvidence, 'UNCONFIRMED');
});

test('an UNCONFIRMED negative case is also excluded from metrics', () => {
  const result = computeCursorRoutingMetrics([{ id: 'c1', task: 't', expectedSkillIds: [], actualSkillIds: null, selectionEvidence: 'UNCONFIRMED' }]);
  assert.equal(result.summary.tn, 0);
  assert.equal(result.summary.casesUnconfirmed, 1);
});

test('when all positive cases are UNCONFIRMED, recall is null (not fabricated as 0)', () => {
  const result = computeCursorRoutingMetrics([
    { id: 'c1', task: 't', expectedSkillIds: ['ush-repo-evidence-plan'], actualSkillIds: null, selectionEvidence: 'UNCONFIRMED' },
    { id: 'c2', task: 't', expectedSkillIds: ['ush-game-meeting-plan'], actualSkillIds: null, selectionEvidence: 'UNCONFIRMED' },
  ]);
  assert.equal(result.summary.recall, null);
  assert.equal(result.summary.precision, null);
});

test('when only CONFIRMED negatives exist (no confirmed positives at all), precision and recall are both null', () => {
  const result = computeCursorRoutingMetrics([
    { id: 'c1', task: 't', expectedSkillIds: [], actualSkillIds: [], selectionEvidence: 'CONFIRMED' },
    { id: 'c2', task: 't', expectedSkillIds: [], actualSkillIds: [], selectionEvidence: 'CONFIRMED' },
  ]);
  assert.equal(result.summary.precision, null);
  assert.equal(result.summary.recall, null);
  assert.equal(result.summary.tn, 2);
});

test('an unknown selectionEvidence value throws', () => {
  assert.throws(
    () => computeCursorRoutingMetrics([{ id: 'c1', task: 't', expectedSkillIds: [], actualSkillIds: [], selectionEvidence: 'MAYBE' }]),
    /selectionEvidence/
  );
});

test('CONFIRMED with actualSkillIds missing/null throws — a confirmed observation must have a real result', () => {
  assert.throws(
    () => computeCursorRoutingMetrics([{ id: 'c1', task: 't', expectedSkillIds: ['ush-repo-evidence-plan'], actualSkillIds: null, selectionEvidence: 'CONFIRMED' }]),
    /CONFIRMED/
  );
});

test('UNCONFIRMED with a fabricated non-null actualSkillIds throws', () => {
  assert.throws(
    () => computeCursorRoutingMetrics([{ id: 'c1', task: 't', expectedSkillIds: ['ush-repo-evidence-plan'], actualSkillIds: ['ush-repo-evidence-plan'], selectionEvidence: 'UNCONFIRMED' }]),
    /UNCONFIRMED/
  );
});

test('a NOT_TESTED case is excluded from metrics, same as UNCONFIRMED', () => {
  const result = computeCursorRoutingMetrics([{ id: 'c1', task: 't', expectedSkillIds: ['ush-repo-evidence-plan'], actualSkillIds: null, selectionEvidence: 'NOT_TESTED' }]);
  assert.equal(result.summary.casesNotTested, 1);
  assert.equal(result.summary.tp, 0);
  assert.equal(result.summary.fn, 0);
});

test('duplicate skill IDs within expectedSkillIds or actualSkillIds throws', () => {
  assert.throws(
    () =>
      computeCursorRoutingMetrics([
        { id: 'c1', task: 't', expectedSkillIds: ['ush-repo-evidence-plan', 'ush-repo-evidence-plan'], actualSkillIds: [], selectionEvidence: 'CONFIRMED' },
      ]),
    /duplicate/i
  );
});

test('non-array expectedSkillIds/actualSkillIds throws', () => {
  assert.throws(() => computeCursorRoutingMetrics([{ id: 'c1', task: 't', expectedSkillIds: 'ush-repo-evidence-plan', actualSkillIds: [], selectionEvidence: 'CONFIRMED' }]));
  assert.throws(() => computeCursorRoutingMetrics([{ id: 'c1', task: 't', expectedSkillIds: [], actualSkillIds: 'ush-repo-evidence-plan', selectionEvidence: 'CONFIRMED' }]));
});

test('a missing case id or task throws', () => {
  assert.throws(() => computeCursorRoutingMetrics([{ task: 't', expectedSkillIds: [], actualSkillIds: [], selectionEvidence: 'CONFIRMED' }]));
  assert.throws(() => computeCursorRoutingMetrics([{ id: 'c1', expectedSkillIds: [], actualSkillIds: [], selectionEvidence: 'CONFIRMED' }]));
});

test('raw per-case evidence is preserved, including UNCONFIRMED/NOT_TESTED cases, not collapsed away', () => {
  const result = computeCursorRoutingMetrics([
    { id: 'c1', task: 't1', expectedSkillIds: ['ush-repo-evidence-plan'], actualSkillIds: null, selectionEvidence: 'UNCONFIRMED' },
    { id: 'c2', task: 't2', expectedSkillIds: [], actualSkillIds: [], selectionEvidence: 'CONFIRMED' },
  ]);
  assert.equal(result.cases.length, 2);
  assert.equal(result.cases[0].id, 'c1');
  assert.equal(result.cases[1].trueNegative, true);
});

test('the real Phase 1.3 Cursor baseline (I1-I5) produces the conceptually expected summary', () => {
  const result = computeCursorRoutingMetrics([
    { id: 'I1', task: 'repo evidence planning', expectedSkillIds: ['ush-repo-evidence-plan'], actualSkillIds: null, selectionEvidence: 'UNCONFIRMED' },
    { id: 'I2', task: 'game meeting planning', expectedSkillIds: ['ush-game-meeting-plan'], actualSkillIds: null, selectionEvidence: 'UNCONFIRMED' },
    { id: 'I3', task: 'concurrent edit coordination', expectedSkillIds: ['ush-concurrent-edit-coordination'], actualSkillIds: null, selectionEvidence: 'UNCONFIRMED' },
    { id: 'I4', task: 'semver negative', expectedSkillIds: [], actualSkillIds: [], selectionEvidence: 'CONFIRMED' },
    { id: 'I5', task: 'paragraph summary negative', expectedSkillIds: [], actualSkillIds: [], selectionEvidence: 'CONFIRMED' },
  ]);
  assert.equal(result.summary.casesTotal, 5);
  assert.equal(result.summary.casesConfirmed, 2);
  assert.equal(result.summary.casesUnconfirmed, 3);
  assert.equal(result.summary.casesNotTested, 0);
  assert.equal(result.summary.tp, 0);
  assert.equal(result.summary.fp, 0);
  assert.equal(result.summary.fn, 0);
  assert.equal(result.summary.tn, 2);
  assert.equal(result.summary.precision, null);
  assert.equal(result.summary.recall, null);
});
