export const SUPPRESS_MS = 10 * 60 * 1000;

// Event-level gates (spec §6). Returns the inbox pushStatus to record when
// not sending.
export function shouldPush({ paused, delayedSync, clockSkew, lastPush, kind, nowMs }) {
  if (paused) return { send: false, status: 'skipped_paused' };
  if (delayedSync || clockSkew) return { send: false, status: 'skipped_suppressed' };
  if (lastPush && lastPush.kind === kind && nowMs - lastPush.atMs < SUPPRESS_MS) return { send: false, status: 'skipped_suppressed' };
  return { send: true };
}

// Guardian-level gates.
export function guardianPushGate({ notificationsEnabled, tokenCount }) {
  if (!notificationsEnabled) return 'skipped_disabled';
  if (tokenCount === 0) return 'skipped_no_device';
  return null;
}
