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
 * `modelVisible` (Phase 1.3 methodology lock, added after a live Codex
 * session proved all six Hub skills are structurally unreachable in the
 * real environment — crowded out of the model-visible skill list by ~330
 * unrelated third-party skills sharing the same user-level skill root).
 * MODEL_VISIBLE=false is NOT a semantic false negative: the router never
 * saw the skill at all, so it never had a chance to reject it. Conflating
 * the two would silently distort recall. Required for every case whose
 * `expectedSkillIds` is non-empty (a "positive" case) — omitting it
 * entirely on a positive case throws, rather than silently assuming
 * reachability. Meaningless (and optional) for a "negative" case
 * (`expectedSkillIds: []`), since there is no expected skill whose
 * visibility needs establishing:
 *   - true:  the expected skill(s) were confirmed model-visible. The case
 *            is routing-evaluable and contributes to TP/FP/FN normally.
 *   - false: REACHABILITY FAILURE — excluded entirely from precision/
 *            recall, and never counted as a false negative.
 *   - null:  VISIBILITY UNKNOWN — also excluded entirely from precision/
 *            recall.
 *
 * Per routing-evaluable case (positive, modelVisible=true, and observed),
 * against `expectedSkillIds`:
 *   - truePositives:  in both expected and actual
 *   - falsePositives: in actual but not expected
 *   - falseNegatives: in expected but not actual (a genuinely missed skill
 *     the router could see and chose not to select)
 *
 * A negative case (expectedSkillIds=[]) is always routing-evaluable once
 * observed, regardless of modelVisible (there's nothing to "see or miss" —
 * only whether the router avoided an unnecessary invocation):
 *   - actual=[] is a true negative (`tn`)
 *   - actual=[...] is a false positive (an unnecessary invocation)
 *
 * precision = tp / (tp + fp), recall = tp / (tp + fn) — both `null` (never
 * NaN or a fabricated 0) when their denominator is 0, so an all-unobserved,
 * all-unreachable, or all-negative baseline reports honestly instead of a
 * misleading number.
 */
export function computeRoutingMetrics(cases) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  let casesObserved = 0;
  let casesReachable = 0;
  let casesUnreachable = 0;
  let casesVisibilityUnknown = 0;

  const perCase = cases.map((c) => {
    const expected = c.expectedSkillIds || [];
    const isPositiveCase = expected.length > 0;
    const observed = c.actualSkillIds !== null && c.actualSkillIds !== undefined;
    const modelVisible = c.modelVisible === undefined ? null : c.modelVisible;

    if (isPositiveCase && c.modelVisible === undefined) {
      throw new Error(
        `routing-eval: case "${c.id}" has a non-empty expectedSkillIds but no "modelVisible" field. ` +
          'Reachability must be stated explicitly (true|false|null) — silently assuming visibility is exactly the bug this field exists to prevent.'
      );
    }

    if (isPositiveCase) {
      if (modelVisible === true) casesReachable += 1;
      else if (modelVisible === false) casesUnreachable += 1;
      else casesVisibilityUnknown += 1;
    }

    if (!observed) {
      return { id: c.id, task: c.task, expectedSkillIds: expected, actualSkillIds: null, modelVisible, observed: false, routingEvaluable: false };
    }
    casesObserved += 1;

    // A positive case is only routing-evaluable when its expected skill(s)
    // were actually confirmed model-visible — otherwise a "miss" tells us
    // nothing about semantic routing quality, only about reachability.
    const routingEvaluable = isPositiveCase ? modelVisible === true : true;

    if (!routingEvaluable) {
      return {
        id: c.id,
        task: c.task,
        expectedSkillIds: expected,
        actualSkillIds: c.actualSkillIds,
        modelVisible,
        observed: true,
        routingEvaluable: false,
        reachabilityFailure: modelVisible === false,
      };
    }

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
      modelVisible,
      observed: true,
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
      casesObserved,
      casesNotObserved: cases.length - casesObserved,
      casesReachable,
      casesUnreachable,
      casesVisibilityUnknown,
    },
    cases: perCase,
  };
}

// Phase 1.3 methodology lock: Pass R (real environment) and Pass P
// (project-scoped Hub-visible environment) are two mechanically distinct
// evidence populations and are NEVER combined into one precision/recall —
// see docs/DESIGN.md. Each gets its own fixture and its own result file;
// running the CLI with no arguments processes both, printed separately.
const DEFAULT_PASSES = [
  { label: 'Pass R (real environment)', input: path.join('evals', 'routing', 'phase-1.3-real-environment-cases.json'), output: path.join('evals', 'routing', 'phase-1.3-real-environment-results.json') },
  { label: 'Pass P (project-scoped)', input: path.join('evals', 'routing', 'phase-1.3-project-scoped-cases.json'), output: path.join('evals', 'routing', 'phase-1.3-project-scoped-results.json') },
];

function runOnePass({ label, input, output }) {
  const fixture = JSON.parse(fs.readFileSync(input, 'utf8'));
  const result = computeRoutingMetrics(fixture.cases || []);
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(`\n${label}: ${result.summary.casesObserved}/${result.summary.casesTotal} case(s) observed ` +
    `(reachable=${result.summary.casesReachable} unreachable=${result.summary.casesUnreachable} visibilityUnknown=${result.summary.casesVisibilityUnknown}).`);
  console.log(
    `  precision=${result.summary.precision === null ? 'null (undefined denominator)' : result.summary.precision} ` +
      `recall=${result.summary.recall === null ? 'null (undefined denominator)' : result.summary.recall} ` +
      `tp=${result.summary.tp} fp=${result.summary.fp} fn=${result.summary.fn} tn=${result.summary.tn}`
  );
  console.log(`  wrote ${output}`);
}

function runCli() {
  if (process.argv[2]) {
    // Explicit single-pass invocation: node scripts/routing-eval.mjs <input> <output>
    runOnePass({ label: process.argv[2], input: process.argv[2], output: process.argv[3] || process.argv[2].replace(/-cases\.json$/, '-results.json') });
    return;
  }
  for (const pass of DEFAULT_PASSES) runOnePass(pass);
}

if (process.argv[1] && import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  runCli();
}
