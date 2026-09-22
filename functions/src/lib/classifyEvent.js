export const DELAYED_MS = 2 * 60 * 60 * 1000;
export const SKEW_FUTURE_MS = 5 * 60 * 1000;
export const SKEW_PAST_MS = 24 * 60 * 60 * 1000;

// Spec §5 step 3. A skewed device clock positions the event by server time
// instead; a delayed (offline-synced) event keeps its scan time but is not
// pushed (nobody wants a 9 p.m. push about a 7 a.m. entry).
export function classifyEvent({ scannedAtMs, receivedAtMs }) {
  const lag = receivedAtMs - scannedAtMs;
  const clockSkew = lag < -SKEW_FUTURE_MS || lag > SKEW_PAST_MS;
  const delayedSync = !clockSkew && lag > DELAYED_MS;
  return { delayedSync, clockSkew, effectiveAtMs: clockSkew ? receivedAtMs : scannedAtMs };
}
