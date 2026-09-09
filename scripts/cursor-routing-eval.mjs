import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

/**
 * Phase 1.3 Cursor routing eval harness — a SEPARATE evaluator from
 * scripts/routing-eval.mjs (Codex). Cursor's uncertainty is not Codex's
 * "context-budget reachability" problem (`modelVisible`); it is that the
 * Cursor Agent CLI's own narrative can claim skill usage ("Using ush-...")
 * with no corroborating directly-observable runtime event (e.g. a
 * `readToolCall` on the exact `~/.cursor/skills/<id>/SKILL.md` path). These
 * are genuinely different kinds of uncertainty and must never be unified
 * into one metric or one field — see docs/DESIGN.md.
 *
 * Each case declares `selectionEvidence`:
 *   - CONFIRMED:   actual selection is directly runtime-observable.
 *                  `actualSkillIds` must be a real array (never null).
 *   - UNCONFIRMED: no direct runtime evidence exists — a model's own
 *                  narrative claim is NOT sufficient. Excluded entirely
 *                  from TP/FP/FN/TN and from precision/recall.
 *   - NOT_TESTED:  the case was never run. Also excluded from metrics.
 * A positive-expected case (non-empty `expectedSkillIds`) that is
 * UNCONFIRMED is never treated as a false negative — the core invariant
 * this evaluator exists to enforce is: model self-report != confirmed
 * routing evidence.
 */
const VALID_SELECTION_EVIDENCE = ['CONFIRMED', 'UNCONFIRMED', 'NOT_TESTED'];

function assertNoDuplicates(list, label, caseId) {
  const seen = new Set();
  for (const id of list) {
    if (seen.has(id)) {
      throw new Error(`cursor-routing-eval: case "${caseId}" has a duplicate ${label} entry "${id}"`);
    }
    seen.add(id);
  }
}

export function computeCursorRoutingMetrics(cases) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  let casesConfirmed = 0;
  let casesUnconfirmed = 0;
  let casesNotTested = 0;

  const perCase = cases.map((c) => {
    if (!c.id || !c.task) {
      throw new Error(`cursor-routing-eval: every case must have both an "id" and a "task" (got ${JSON.stringify(c)})`);
    }
    if (!Array.isArray(c.expectedSkillIds)) {
      throw new Error(`cursor-routing-eval: case "${c.id}".expectedSkillIds must be an array`);
    }
    if (!VALID_SELECTION_EVIDENCE.includes(c.selectionEvidence)) {
      throw new Error(
        `cursor-routing-eval: case "${c.id}" has an unknown selectionEvidence "${c.selectionEvidence}" — must be one of ${VALID_SELECTION_EVIDENCE.join('|')}`
      );
    }
    if (c.selectionEvidence === 'CONFIRMED' && !Array.isArray(c.actualSkillIds)) {
      throw new Error(`cursor-routing-eval: case "${c.id}" is CONFIRMED but actualSkillIds is missing/null — a confirmed observation must have a real result`);
    }
    if (c.selectionEvidence === 'UNCONFIRMED' && c.actualSkillIds !== null && c.actualSkillIds !== undefined) {
      throw new Error(`cursor-routing-eval: case "${c.id}" is UNCONFIRMED but actualSkillIds is non-null (${JSON.stringify(c.actualSkillIds)}) — do not fabricate an observation that wasn't made`);
    }
    if (Array.isArray(c.actualSkillIds)) assertNoDuplicates(c.actualSkillIds, 'actualSkillIds', c.id);
    assertNoDuplicates(c.expectedSkillIds, 'expectedSkillIds', c.id);

    if (c.selectionEvidence === 'CONFIRMED') casesConfirmed += 1;
    else if (c.selectionEvidence === 'UNCONFIRMED') casesUnconfirmed += 1;
    else casesNotTested += 1;

    const routingEvaluable = c.selectionEvidence === 'CONFIRMED';
    if (!routingEvaluable) {
      return {
        id: c.id,
        task: c.task,
        expectedSkillIds: c.expectedSkillIds,
        actualSkillIds: c.actualSkillIds === undefined ? null : c.actualSkillIds,
        selectionEvidence: c.selectionEvidence,
        routingEvaluable: false,
      };
    }

    const expected = c.expectedSkillIds;
    const actual = c.actualSkillIds;
    const truePositives = expected.filter((id) => actual.includes(id));
    const falsePositives = actual.filter((id) => !expected.includes(id));
    const falseNegatives = expected.filter((id) => !actual.includes(id));
    const isTrueNegative = expected.length === 0 && actual.length === 0;

    tp += truePositives.length;
    fp += falsePositives.length;
    fn += falseNegatives.length;
    if (isTrueNegative) tn += 1;

    return {
      id: c.id,
      task: c.task,
      expectedSkillIds: expected,
      actualSkillIds: actual,
      selectionEvidence: c.selectionEvidence,
      routingEvaluable: true,
      truePositives,
      falsePositives,
      falseNegatives,
      trueNegative: isTrueNegative,
    };
  });

  const precision = tp + fp > 0 ? tp / (tp + fp) : null;
  const recall = tp + fn > 0 ? tp / (tp + fn) : null;

  return {
    summary: {
      precision,
      recall,
      tp,
      fp,
      fn,
      tn,
      casesTotal: cases.length,
      casesConfirmed,
      casesUnconfirmed,
      casesNotTested,
    },
    cases: perCase,
  };
}

function runCli() {
  const inputPath = process.argv[2] || path.join('evals', 'routing', 'phase-1.3-cursor-cases.json');
  const outputPath = process.argv[3] || path.join('evals', 'routing', 'phase-1.3-cursor-results.json');
  const fixture = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const result = computeCursorRoutingMetrics(fixture.cases || []);
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
  console.log(
    `Cursor routing: ${result.summary.casesConfirmed} confirmed, ${result.summary.casesUnconfirmed} unconfirmed, ${result.summary.casesNotTested} not tested (of ${result.summary.casesTotal} total).`
  );
  console.log(
    `  precision=${result.summary.precision === null ? 'null (undefined denominator)' : result.summary.precision} ` +
      `recall=${result.summary.recall === null ? 'null (undefined denominator)' : result.summary.recall} ` +
      `tp=${result.summary.tp} fp=${result.summary.fp} fn=${result.summary.fn} tn=${result.summary.tn}`
  );
  console.log(`  wrote ${outputPath}`);
}

if (process.argv[1] && import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  runCli();
}
