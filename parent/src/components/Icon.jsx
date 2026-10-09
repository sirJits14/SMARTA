// Inline nav icons: outline when idle, filled when active (Iconly-style).
// Gear and phone paths adapted from Feather Icons (MIT). No icon dependency, so the
// eager bundle stays small.
import { T } from '../styles.js';
const GEAR = 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z';
const HOUSE = 'M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-5.5H9V20H5a1 1 0 0 1-1-1z';
const TRAY = 'M3 13.5 5.4 5.7a2 2 0 0 1 1.9-1.4h9.4a2 2 0 0 1 1.9 1.4L21 13.5V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z';
const TRAY_LIP = 'M3 13.5h5l1.5 2.5h5l1.5-2.5h5';
const MEGAPHONE = 'M3 10v4a1 1 0 0 0 1 1h3l6 4.5V4.5L7 9H4a1 1 0 0 0-1 1z';
const WAVES = 'M16.5 9a4 4 0 0 1 0 6 M19.5 6.5a8 8 0 0 1 0 11';
const PHONE = 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z';

export default function Icon({ name, filled = false, size = 24, strokeWidth = 1.75 }) {
  const fill = filled ? 'currentColor' : 'none';
  // Cut-out detail on a filled icon uses the on-primary color so it reads on the
  // teal shape in both themes. Set via style: SVG attributes don't resolve var().
  const detail = filled ? T.onPrimary : 'currentColor';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"
      fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {name === 'home' && <path d={HOUSE} fill={fill} />}
      {name === 'back' && <><path d="M15 18l-6-6 6-6" /><path d="M9 12h11" /></>}
      {name === 'inbox' && <><path d={TRAY} fill={fill} /><path d={TRAY_LIP} style={{ stroke: detail }} /></>}
      {name === 'notices' && <><path d={MEGAPHONE} fill={fill} /><path d={WAVES} /></>}
      {name === 'settings' && <><path d={GEAR} fill={fill} /><circle cx="12" cy="12" r="3" style={{ fill: filled ? T.onPrimary : 'none', stroke: detail }} /></>}
      {name === 'sun' && <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>}
      {name === 'moon' && <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />}
      {name === 'check' && <path d="M5 12l5 5 9-11" />}
      {name === 'bell' && <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>}
      {name === 'halfMoon' && <><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" /></>}
      {name === 'download' && <><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" /></>}
      {name === 'people' && <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7" /><path d="M18 14.2a6.5 6.5 0 0 1 3.5 5.8" /></>}
      {name === 'envelope' && <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>}
      {name === 'phone' && <path d={PHONE} />}
      {name === 'shield' && <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />}
      {name === 'info' && <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.5h.01" /></>}
      {name === 'chevron' && <path d="M9 6l6 6-6 6" />}
      {name === 'share' && <><path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" /></>}
      {name === 'plusSquare' && <><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 8v8M8 12h8" /></>}
      {name === 'globe' && <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z" /></>}
      {/* Arrow into a doorway / out of one: a learner entering or leaving school. */}
      {name === 'arrive' && <><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" /><path d="M9 16l4-4-4-4" /><path d="M13 12H3" /></>}
      {name === 'leave' && <><path d="M10 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /><path d="M16 16l4-4-4-4" /><path d="M20 12H9" /></>}
      {name === 'clock' && <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}
    </svg>
  );
}
