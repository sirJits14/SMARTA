import S from '../strings.js';

// The main Settings list, top to bottom. `group` splits the rounded blocks,
// `tile` names a --tile-* color (shared/theme/theme.css), `icon` an Icon.jsx glyph.
export const SECTIONS = [
  { key: 'notifications', group: 1, title: S.settingsNotifications, tile: 'red', icon: 'bell' },
  { key: 'appearance', group: 1, title: S.themeTitle, tile: 'indigo', icon: 'halfMoon' },
  { key: 'install', group: 1, title: S.settingsInstall, tile: 'blue', icon: 'download' },
  { key: 'learners', group: 2, title: S.settingsMyLearners, tile: 'green', icon: 'people' },
  { key: 'reports', group: 2, title: S.settingsReportsRequests, tile: 'orange', icon: 'envelope' },
  { key: 'help', group: 3, title: S.settingsHelp, tile: 'teal', icon: 'phone' },
  { key: 'privacy', group: 3, title: S.settingsPrivacyAccount, tile: 'grey', icon: 'shield' },
  { key: 'about', group: 3, title: S.settingsAbout, tile: 'grey', icon: 'info' },
];

// Visible sections as one array per group, skipping `hidden` keys and empty groups.
export function sectionGroups(hidden = []) {
  const groups = new Map();
  for (const s of SECTIONS) {
    if (hidden.includes(s.key)) continue;
    if (!groups.has(s.group)) groups.set(s.group, []);
    groups.get(s.group).push(s);
  }
  return [...groups.values()];
}

// Short right-hand value for the Notifications row, per notificationState().
const NOTIF_VALUE = {
  on: S.notifShortOn, off: S.notifShortOff, account_off: S.notifShortOff, blocked: S.notifShortBlocked,
  unsupported: S.notifShortUnsupported, ios_needs_install: S.notifShortInstall,
};
export const notificationValue = (state) => NOTIF_VALUE[state] ?? '';

export const openReportCount = (reports) => (reports || []).filter((r) => r.status === 'open').length;

// Help & Contact School rows from settings/parent_portal. Blank fields are
// skipped; a Facebook link must be https.
export function contactRows(portal) {
  const v = (k) => (typeof portal?.[k] === 'string' ? portal[k].trim() : '');
  const phone = v('contactPhone'), email = v('contactEmail'), facebook = v('contactFacebookUrl'), hours = v('officeHours');
  const dial = phone.replace(/[^\d+]/g, '');
  const rows = [];
  if (phone) rows.push({ key: 'phone', label: S.helpPhone, value: phone, ...(/\d/.test(dial) ? { href: `tel:${dial}` } : {}), tile: 'green', icon: 'phone' });
  if (email) rows.push({ key: 'email', label: S.helpEmail, value: email, href: `mailto:${email}`, tile: 'blue', icon: 'envelope' });
  if (facebook.startsWith('https://')) rows.push({ key: 'facebook', label: S.helpFacebook, value: facebook.replace(/^https:\/\/(www\.)?/, ''), href: facebook, external: true, tile: 'indigo', icon: 'globe' });
  if (hours) rows.push({ key: 'hours', label: S.helpHours, value: hours, tile: 'grey', icon: 'clock' });
  return rows;
}
