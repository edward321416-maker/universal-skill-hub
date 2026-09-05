/**
 * Deterministic eligibility filter — stage 1 of the two-stage router
 * (deterministic filter -> native semantic skill matching, see docs/DESIGN.md).
 * This stage never makes a semantic "does this skill fit the task" judgment;
 * it only rules skills IN or OUT based on machine-checkable facts: lifecycle
 * state, risk tier vs. invocation mode, and platform compatibility.
 */
export function evaluateEligibility({ skill, task }) {
  const reasons = [];

  if (skill.status === 'QUARANTINED') {
    return { decision: 'BLOCK', reasons: [`skill "${skill.skill_id}" is QUARANTINED and must never be invoked`] };
  }

  if (!skill.platforms.includes(task.platform)) {
    return { decision: 'BLOCK', reasons: [`skill "${skill.skill_id}" does not list platform "${task.platform}" as supported`] };
  }

  if (skill.risk === 'L4' && task.autoInvoke) {
    return { decision: 'BLOCK', reasons: [`skill "${skill.skill_id}" is risk tier L4 (destructive/high-consequence) and cannot be auto-invoked; it requires explicit informed confirmation`] };
  }

  if (skill.status === 'DEPRECATED') {
    return { decision: 'SKIP', reasons: [`skill "${skill.skill_id}" is DEPRECATED`] };
  }

  return { decision: 'USE', reasons };
}
