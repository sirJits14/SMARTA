// Inline nav icons: outline when idle, filled when active (Iconly-style).
// Gear path adapted from Feather Icons (MIT). No icon dependency, so the
// eager bundle stays small.
import { T } from '../styles.js';
const GEAR = 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z';
const HOUSE = 'M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-5.5H9V20H5a1 1 0 0 1-1-1z';
const TRAY = 'M3 13.5 5.4 5.7a2 2 0 0 1 1.9-1.4h9.4a2 2 0 0 1 1.9 1.4L21 13.5V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z';
const TRAY_LIP = 'M3 13.5h5l1.5 2.5h5l1.5-2.5h5';
const MEGAPHONE = 'M3 10v4a1 1 0 0 0 1 1h3l6 4.5V4.5L7 9H4a1 1 0 0 0-1 1z';
const WAVES = 'M16.5 9a4 4 0 0 1 0 6 M19.5 6.5a8 8 0 0 1 0 11';

export default function Icon({ name, filled = false, size = 24 }) {
  const fill = filled ? 'currentColor' : 'none';
  // Cut-out detail on a filled icon uses the on-primary color so it reads on the
  // teal shape in both themes. Set via style: SVG attributes don't resolve var().
  const detail = filled ? T.onPrimary : 'currentColor';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"
      fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      {name === 'home' && <path d={HOUSE} fill={fill} />}
      {name === 'back' && <><path d="M15 18l-6-6 6-6" /><path d="M9 12h11" /></>}
      {name === 'inbox' && <><path d={TRAY} fill={fill} /><path d={TRAY_LIP} style={{ stroke: detail }} /></>}
      {name === 'notices' && <><path d={MEGAPHONE} fill={fill} /><path d={WAVES} /></>}
      {name === 'settings' && <><path d={GEAR} fill={fill} /><circle cx="12" cy="12" r="3" style={{ fill: filled ? T.onPrimary : 'none', stroke: detail }} /></>}
      {name === 'sun' && <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>}
      {name === 'moon' && <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />}
      {name === 'check' && <path d="M5 12l5 5 9-11" />}
    </svg>
  );
}
