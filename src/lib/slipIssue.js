// Plain-words text for the activation-slip screens (spec 2026-10-13 §5–6,
// spec 2026-10-16 for the slip batch).
const SKIP_REASONS = {
  restricted: 'restricted', missing: 'learner record missing', 'fully-linked': 'all slots already linked',
  'not-enrolled': 'not enrolled this school year',
};

export const skipReasonText = (reason) => SKIP_REASONS[reason] || reason;

// "28 slips issued, 2 skipped (all slots already linked)."
// A slip batch press adds " · 3 still in the batch" when it hit its cap.
export function issuedSummary({ slips, skipped, remaining = 0 }) {
  const issued = `${slips.length} ${slips.length === 1 ? 'slip' : 'slips'} issued`;
  const reasons = [...new Set(skipped.map((s) => skipReasonText(s.reason)))].join(', ');
  const summary = skipped.length ? `${issued}, ${skipped.length} skipped (${reasons})` : issued;
  return remaining ? `${summary} · ${remaining} still in the batch.` : `${summary}.`;
}

export function slotsFreeText({ guardian, adviser }) {
  return `New slip ready: ${guardian} guardian / ${adviser} adviser ${guardian + adviser === 1 ? 'slot' : 'slots'} free. Print it now — the code is shown only once.`;
}
