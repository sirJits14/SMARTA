// Families get one neutral update per settled change. An update still
// waiting to be sent keeps the state families last saw as its baseline, so
// flagging and then undoing inside the window sends nothing at all.
export const NOTIFY_DELAY_MS = 120000;

export function nextNotice(existing, { previousAbsent, absent }) {
  const baselineAbsent = existing?.status === 'pending' ? existing.baselineAbsent === true : previousAbsent === true;
  return { status: absent === baselineAbsent ? 'cancelled' : 'pending', baselineAbsent };
}
