// Plain-words text for the activation-slip screens (spec 2026-10-13 §5–6).
const SKIP_REASONS = { restricted: 'restricted', missing: 'learner record missing', 'fully-linked': 'all slots already linked' };

// "28 slips issued, 2 skipped (all slots already linked)."
export function issuedSummary({ slips, skipped }) {
  const issued = `${slips.length} ${slips.length === 1 ? 'slip' : 'slips'} issued`;
  if (!skipped.length) return `${issued}.`;
  const reasons = [...new Set(skipped.map((s) => SKIP_REASONS[s.reason] || s.reason))].join(', ');
  return `${issued}, ${skipped.length} skipped (${reasons}).`;
}

export function slotsFreeText({ guardian, adviser }) {
  return `New slip ready: ${guardian} guardian / ${adviser} adviser ${guardian + adviser === 1 ? 'slot' : 'slots'} free. Print it now — the code is shown only once.`;
}
