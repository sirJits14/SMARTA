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

// Bulk printing works on ticked sections. The "select" shortcut ticks only
// sections without an open slip; sections with one can still be ticked by hand.
const hasOpenSlip = (bySection, section) => !!bySection.get(section.id)?.slip;
export const needingSlip = (candidates, bySection) => candidates.filter((s) => !hasOpenSlip(bySection, s));
export const withSelected = (selection, sections) => new Set([...selection, ...sections.map((s) => s.id)]);
// Drops ticks for sections that gained an adviser or left scope since ticking.
export const selectedSections = (selection, candidates) => candidates.filter((s) => selection.has(s.id));

export function selectionText(sections, bySection) {
  const replacing = sections.filter((s) => hasOpenSlip(bySection, s)).length;
  const base = `${plural(sections.length, 'section', 'sections')} selected`;
  return replacing ? `${base} · ${replacing} will replace an unused slip` : base;
}

const listed = (sections) => {
  const names = sections.slice(0, 3).map(sectionLabel);
  return sections.length > 3 ? `${names.join(', ')} and ${sections.length - 3} more` : names.join(sections.length === 2 ? ' and ' : ', ');
};

export function slipConfirmMessage(kind, sections, bySection) {
  if (kind === 'revoke') return `Revoke the advisory slip for ${sectionLabel(sections[0])}? The printed slip stops working.`;
  if (sections.length > 1) {
    const replacing = sections.filter((s) => hasOpenSlip(bySection, s));
    const base = `Issue advisory slips for ${sections.length} sections? Print them right away: the codes are shown only once.`;
    if (!replacing.length) return base;
    return replacing.length === 1
      ? `${base} ${listed(replacing)} already has an unused slip. That old slip stops working.`
      : `${base} ${replacing.length} already have an unused slip (${listed(replacing)}). Those old slips stop working.`;
  }
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

// The slip sheets and the ID-card sheets must never share the DOM, or one
// printout would carry the other's content (live one-time codes).
export const showAdvisoryPanel = (advisorySlips, detailSection) => !!advisorySlips && !detailSection;

// After a revoke, the open panel must stop showing and printing that code.
// Returns null when nothing is left to print.
export function withoutRevokedSlip(result, sectionId) {
  if (!result) return null;
  const issued = result.issued.filter((slip) => slip.sectionId !== sectionId);
  return issued.length ? { ...result, issued } : null;
}
