// Kiosks heartbeat lastSeenAt every 2 minutes (bnhs-student-kiosk App.jsx),
// so 5 minutes of silence means the kiosk page is closed or disconnected.
// "Online" never means the computer itself is powered on.
export const ONLINE_WINDOW_MS = 5 * 60_000;
export const PRESENCE_TICK_MS = 30_000;

const millis = (t) => (t?.toMillis ? t.toMillis() : t instanceof Date ? t.getTime() : null);

export function formatAgo(ms, nowMs) {
  const seconds = Math.max(0, Math.round((nowMs - ms) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function kioskPresence(kiosk, nowMs) {
  if (kiosk.active !== true) return { state: 'deactivated', label: 'Deactivated' };
  const seen = millis(kiosk.lastSeenAt);
  if (seen == null) return { state: 'offline', label: 'Offline · never seen' };
  if (nowMs - seen <= ONLINE_WINDOW_MS) return { state: 'online', label: 'Online' };
  return { state: 'offline', label: `Offline · last seen ${formatAgo(seen, nowMs)}` };
}

export function modeChangeNote(kiosk) {
  if (kiosk.mode !== 'entrance' && kiosk.mode !== 'exit') return 'not reported yet';
  const at = millis(kiosk.modeChangedAt);
  const when = at == null ? '' : `, ${new Date(at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
  if (kiosk.modeChangedBy === 'kiosk') return `changed at the kiosk${when}`;
  return `changed by ${kiosk.modeChangedByName || kiosk.modeChangedBy || 'staff'}${when}`;
}

// Deleted kiosks stay as tombstones so the Scan log can still name them.
export const visibleKiosks = (kiosks) => kiosks.filter((k) => k.deleted !== true);
