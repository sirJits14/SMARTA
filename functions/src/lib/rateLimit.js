// Fixed-window counter. `state` is what rate_limits/{uid}.{action} holds.
export function takeToken(state, { nowMs, windowMs, max }) {
  if (!state || nowMs - state.windowStartMs >= windowMs) return { allowed: true, next: { count: 1, windowStartMs: nowMs } };
  if (state.count >= max) return { allowed: false, next: state };
  return { allowed: true, next: { count: state.count + 1, windowStartMs: state.windowStartMs } };
}
