import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineString } from 'firebase-functions/params';
import { Timestamp } from 'firebase-admin/firestore';
import { db, auth, messaging } from './src/admin.js';
import { handleScanEvent } from './src/handlers/scanEvent.js';
import { detectLegacyScans, toScanEventData, legacyEventId } from './src/handlers/legacyAttendanceSync.js';
import { guardianIdentity, staffIdentity, toHttpsError } from './src/callable.js';
import { issueActivationCodes, revokeCode, activateCode, acceptConsent } from './src/handlers/codes.js';
import { requestAccess, resolveAccessRequest, revokeLink, setActivationRestricted } from './src/handlers/links.js';
import { registerKiosk, deactivateKiosk } from './src/handlers/kiosks.js';
import { submitReport, resolveReport, correctEvent, addManualEvent } from './src/handlers/reports.js';
import { deleteGuardianAccount } from './src/handlers/account.js';
import { expireLinks, pruneDevices, reconcileEvents } from './src/handlers/scheduled.js';
import { auditSettingsChange } from './src/handlers/settingsAudit.js';

setGlobalOptions({ region: 'asia-southeast1', minInstances: 0, maxInstances: 10, memory: '256MiB' });

export const PORTAL_URL = defineString('PORTAL_URL', { default: 'https://bnhs-parent.web.app' });

const deps = () => ({ db, messaging, portalUrl: PORTAL_URL.value(), now: () => new Date() });

export const onScanEventCreated = onDocumentCreated({ document: 'scan_events/{eventId}', retry: true }, async (event) => {
  const snap = event.data;
  if (!snap) return;
  await handleScanEvent(deps(), { eventId: event.params.eventId, data: snap.data() });
});

// TEMP(kiosk-v1-compat): see src/handlers/legacyAttendanceSync.js -- bridges
// kiosk v1's student_attendance writes into the same pipeline scan_events
// feeds, until kiosk v2 is deployed and devices are registered (K1/K2 in
// docs/parent-portal-rollout-checklist.md). Delete this export, the import
// above, and the 'attendance-sync' branch in scanEvent.js once that's done.
export const onLegacyAttendanceSynced = onDocumentWritten({ document: 'student_attendance/{docId}', retry: true }, async (event) => {
  const before = event.data?.before?.data() || null;
  const after = event.data?.after?.data() || null;
  const scans = detectLegacyScans({ before, after });
  if (scans.length === 0) return;
  const receivedAt = Timestamp.now();
  for (const scan of scans) {
    await handleScanEvent(deps(), { eventId: legacyEventId(scan), data: toScanEventData(scan, receivedAt) });
  }
});

const callDeps = () => ({ db, auth, now: () => new Date() });
const guardianCall = (fn) => onCall({ enforceAppCheck: true }, async (req) => {
  try { return await fn({ ...callDeps(), ...guardianIdentity(req) }, req.data || {}); } catch (e) { throw toHttpsError(e); }
});
const staffCall = (fn) => onCall({ enforceAppCheck: true }, async (req) => {
  try { return await fn({ ...callDeps(), ...(await staffIdentity(db, req)) }, req.data || {}); } catch (e) { throw toHttpsError(e); }
});

export const issueActivationCodesFn = staffCall(issueActivationCodes);
export const revokeCodeFn = staffCall(revokeCode);
export const activateCodeFn = guardianCall(activateCode);
export const acceptConsentFn = guardianCall(acceptConsent);

export const requestAccessFn = guardianCall(requestAccess);
export const resolveAccessRequestFn = staffCall(resolveAccessRequest);
export const revokeLinkFn = staffCall(revokeLink);
export const setActivationRestrictedFn = staffCall(setActivationRestricted);
export const registerKioskFn = staffCall(registerKiosk);
export const deactivateKioskFn = staffCall(deactivateKiosk);

export const submitReportFn = guardianCall(submitReport);
export const resolveReportFn = staffCall(resolveReport);
export const correctEventFn = staffCall(correctEvent);
export const addManualEventFn = staffCall(addManualEvent);
export const deleteGuardianAccountFn = guardianCall(deleteGuardianAccount);

const jobDeps = () => ({ db, auth, messaging, portalUrl: PORTAL_URL.value(), now: () => new Date() });
const SCHED = { timeZone: 'Asia/Manila', retryCount: 1 };

export const expireLinksJob = onSchedule({ schedule: '10 1 * * *', ...SCHED }, () => expireLinks(jobDeps()));
export const pruneDevicesJob = onSchedule({ schedule: '40 1 * * *', ...SCHED }, () => pruneDevices(jobDeps()));
export const reconcileEventsJob = onSchedule({ schedule: '20 2 * * *', ...SCHED }, () => reconcileEvents(jobDeps()));

export const onParentPortalSettingsChanged = onDocumentWritten('settings/parent_portal', (event) =>
  auditSettingsChange(db, { before: event.data?.before?.data() || null, after: event.data?.after?.data() || null }));
