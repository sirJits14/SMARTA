import { previousSchoolYear, schoolYearStartDate } from '../../shared/dates.js';
const DAY = 86400_000;

// Spec §4 "Retention windows", as absolute cut-offs.
export function retentionCutoffs({ currentSchoolYear, nowMs }) {
  return {
    eventsBefore: schoolYearStartDate(previousSchoolYear(currentSchoolYear)),
    resolvedBeforeMs: nowMs - 365 * DAY,
    linksBeforeMs: nowMs - 365 * DAY,
    codesBeforeMs: nowMs - 365 * DAY,
    auditBeforeMs: nowMs - 730 * DAY,
    dormantBeforeMs: nowMs - 365 * DAY,
    devicesStaleBeforeMs: nowMs - 60 * DAY,
    devicesDisabledBeforeMs: nowMs - 7 * DAY,
  };
}
