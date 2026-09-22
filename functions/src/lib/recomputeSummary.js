// Rebuilds learners/{id}.today and .recent from the learner's recent events.
// Ordering is by effectiveAtMs (scan time, or server time for skewed
// clocks), never by arrival, so delayed and out-of-order events land right.
export function recomputeSummary({ events, todayDate, recentLimit = 10 }) {
  const live = events.filter((e) => e.status === 'recorded').sort((a, b) => b.effectiveAtMs - a.effectiveAtMs);
  const today = live.filter((e) => e.scannedDate === todayDate);
  const ins = today.filter((e) => e.kind === 'in');
  const outs = today.filter((e) => e.kind === 'out');
  const firstIn = ins.length ? ins[ins.length - 1] : null;
  const lastOut = outs.length ? outs[0] : null;
  const status = today.length === 0 ? 'no_scan' : today[0].kind === 'in' ? 'in' : 'out';
  return {
    today: {
      date: todayDate,
      firstIn: firstIn ? { time: firstIn.scannedTime, eventId: firstIn.id } : null,
      lastOut: lastOut ? { time: lastOut.scannedTime, eventId: lastOut.id } : null,
      status,
    },
    recent: live.slice(0, recentLimit).map((e) => ({ id: e.id, kind: e.kind, scannedDate: e.scannedDate, scannedTime: e.scannedTime })),
  };
}
