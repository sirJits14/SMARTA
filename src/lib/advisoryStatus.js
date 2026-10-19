import { shortDate } from './schoolAssignments.js';
import { sectionLabel } from '../../parent/src/lib/school.js';
import { canIssueAdvisorySlip } from './access.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const SKIPPED = {
  'has-adviser': ['it already has an adviser', 'they already have an adviser'],
  'out-of-scope': ['it is outside your grades', 'they are outside your grades'],
  'not-found': ['it was not found', 'they were not found'],
};

export function adviserStatusText(status) {
  if (!status) return '';
  if (status.adviser) return `In app: ${status.adviser.name || status.adviser.email}`;
  if (status.slip) return `Slip issued · ${shortDate(status.slip.issuedAt)}`;
  return 'No adviser in app';
}

export const slipCandidates = (sections, bySection, me) =>
  sections.filter((s) => canIssueAdvisorySlip(me, s) && bySection.has(s.id) && !bySection.get(s.id).adviser);

export function slipConfirmMessage(kind, sections, bySection) {
  if (kind === 'revoke') return `Revoke the advisory slip for ${sectionLabel(sections[0])}? The printed slip stops working.`;
  if (sections.length > 1) return `Issue advisory slips for ${sections.length} sections without an adviser? Print them right away: the codes are shown only once. Any older unused slips for these sections stop working.`;
  const [section] = sections;
  return bySection.get(section.id)?.slip
    ? `Print a new advisory slip for ${sectionLabel(section)}? A new code will be printed. The old slip stops working.`
    : `Issue an advisory slip for ${sectionLabel(section)}? Print it right away: the code is shown only once.`;
}

export function issuedText({ issued = [], skipped = [] }) {
  const parts = [`${plural(issued.length, 'slip', 'slips')} ready.`];
  const reasons = [...new Set(skipped.map((s) => s.reason))];
  for (const reason of reasons) {
    const n = skipped.filter((s) => s.reason === reason).length;
    parts.push(`${plural(n, 'section', 'sections')} skipped because ${SKIPPED[reason][n === 1 ? 0 : 1]}.`);
  }
  return parts.join(' ');
}
