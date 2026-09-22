import { audit } from '../audit.js';

const FIELDS = ['notificationsPaused', 'pausedBy', 'pauseNote', 'announcement', 'consentVersion', 'privacyNoticeUrl'];
const pick = (o) => Object.fromEntries(FIELDS.filter((k) => o && k in o).map((k) => [k, o[k]]));

export function auditSettingsChange(db, { before, after }) {
  return audit(db, { action: 'portal.settings_changed', actorType: 'staff', actorUid: after?.pausedBy || after?.updatedBy || null, targetType: 'settings', targetId: 'parent_portal', details: { before: pick(before), after: pick(after) } });
}
