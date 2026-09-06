import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

/**
 * Phase 1.3 routing eval harness. Measures the native host's semantic
 * routing behavior (which skill(s) it actually selected for a task, without
 * being told the skill's name) against an expected-candidate fixture — it
 * does NOT implement or replace routing. `actualSkillIds` must be recorded
 * from a real observation (a live host session); this harness only scores
 * what's given it.
 *
 * A case's `actualSkillIds` may be:
 *   - an array (possibly empty) of skill ids actually selected — "observed"
 *   - `null` — not yet observed; excluded from tp/fp/fn/precision/recall,
 *     but still reported per-case so it isn't silently lost.
 *
 * Per case (only when observed), against `expectedSkillIds`:
 *   - truePositives:  in both expected and actual
 *   - falsePositives: in actual but not expected (includes an unnecessary
 *     invocation on a case that expected no skill at all)
 *   - falseNegatives: in expected but not actual (a missed/expected skill)
 *   - a case with expectedSkillIds=[] and actualSkillIds=[] is a true
 *     negative (`tn`) — correctly avoided invoking anything. It does not
 *     enter precision/recall (which are about skill selections), but is
 *     tracked so "avoids unnecessary invocation" is inspectable.
 *
 * precision = tp / (tp + fp), recall = tp / (tp + fn) — both `null` (never
 * NaN or a fabricated 0) when their denominator is 0, so an all-unobserved
 * or all-negative baseline reports honestly instead of a misleading number.
 */
export function computeRoutingMetrics(cases) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  let casesObserved = 0;

  const perCase = cases.map((c) => {
    const expected = c.expectedSkillIds || [];
    const observed = c.actualSkillIds !== null && c.actualSkillIds !== undefined;

    if (!observed) {
      return { id: c.id, task: c.task, expectedSkillIds: expected, actualSkillIds: null, observed: false };
    }

    casesObserved += 1;
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
      observed: true,
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
      casesObserved,
      casesNotObserved: cases.length - casesObserved,
    },
    cases: perCase,
  };
}

function runCli() {
  const inputPath = process.argv[2] || path.join('evals', 'routing', 'phase-1.3-live-cases.json');
  const outputPath = process.argv[3] || path.join('evals', 'routing', 'phase-1.3-live-results.json');
  const fixture = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const result = computeRoutingMetrics(fixture.cases || []);
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
  console.log(`routing-eval: ${result.summary.casesObserved}/${result.summary.casesTotal} case(s) observed.`);
  console.log(
    `precision=${result.summary.precision === null ? 'null (undefined denominator)' : result.summary.precision} ` +
      `recall=${result.summary.recall === null ? 'null (undefined denominator)' : result.summary.recall} ` +
      `tp=${result.summary.tp} fp=${result.summary.fp} fn=${result.summary.fn} tn=${result.summary.tn}`
  );
  console.log(`wrote ${outputPath}`);
}

if (process.argv[1] && import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  runCli();
}
