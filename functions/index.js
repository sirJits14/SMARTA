import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineString } from 'firebase-functions/params';
import { db, auth, messaging } from './src/admin.js';
import { handleScanEvent } from './src/handlers/scanEvent.js';
import { guardianIdentity, staffIdentity, adminIdentity, toHttpsError } from './src/callable.js';
import { issueActivationCodes, revokeCode, activateCode, acceptConsent } from './src/handlers/codes.js';
import { endSchoolYear } from './src/handlers/schoolYear.js';
import { requestAccess, resolveAccessRequest, revokeLink, setActivationRestricted } from './src/handlers/links.js';
import { registerKiosk, deactivateKiosk, provisionKiosk, resetKioskPassword } from './src/handlers/kiosks.js';
import { submitReport, resolveReport, correctEvent, addManualEvent } from './src/handlers/reports.js';
import { deleteGuardianAccount } from './src/handlers/account.js';
import { createStaffUser, updateStaffUser, setStaffUserDisabled, resetStaffPassword, deleteStaffUser, changeOwnPassword } from './src/handlers/users.js';
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

const callDeps = () => ({ db, auth, now: () => new Date() });
const guardianCall = (fn) => onCall({ enforceAppCheck: true }, async (req) => {
  try { return await fn({ ...callDeps(), ...guardianIdentity(req) }, req.data || {}); } catch (e) { throw toHttpsError(e); }
});
const staffCall = (fn) => onCall({ enforceAppCheck: true }, async (req) => {
  try { return await fn({ ...callDeps(), ...(await staffIdentity(db, auth, req)) }, req.data || {}); } catch (e) { throw toHttpsError(e); }
});
// Account management and every page behind it (Guardians, Settings) is
// administrator-only; coordinators reach none of these.
const adminCall = (fn) => onCall({ enforceAppCheck: true }, async (req) => {
  try { return await fn({ ...callDeps(), ...(await adminIdentity(db, auth, req)) }, req.data || {}); } catch (e) { throw toHttpsError(e); }
});

export const issueActivationCodesFn = adminCall(issueActivationCodes);
export const revokeCodeFn = adminCall(revokeCode);
export const activateCodeFn = guardianCall(activateCode);
export const acceptConsentFn = guardianCall(acceptConsent);
export const endSchoolYearFn = adminCall(endSchoolYear);

export const requestAccessFn = guardianCall(requestAccess);
export const resolveAccessRequestFn = adminCall(resolveAccessRequest);
export const revokeLinkFn = adminCall(revokeLink);
export const setActivationRestrictedFn = adminCall(setActivationRestricted);
export const registerKioskFn = adminCall(registerKiosk);
export const deactivateKioskFn = adminCall(deactivateKiosk);
export const provisionKioskFn = adminCall(provisionKiosk);
export const resetKioskPasswordFn = adminCall(resetKioskPassword);

export const submitReportFn = guardianCall(submitReport);
export const resolveReportFn = adminCall(resolveReport);
export const correctEventFn = adminCall(correctEvent);
export const addManualEventFn = adminCall(addManualEvent);
export const deleteGuardianAccountFn = guardianCall(deleteGuardianAccount);

export const createStaffUserFn = adminCall(createStaffUser);
export const updateStaffUserFn = adminCall(updateStaffUser);
export const setStaffUserDisabledFn = adminCall(setStaffUserDisabled);
export const resetStaffPasswordFn = adminCall(resetStaffPassword);
export const deleteStaffUserFn = adminCall(deleteStaffUser);
// Any active staff member, including one still on a temporary password.
export const changeOwnPasswordFn = staffCall(changeOwnPassword);

const jobDeps = () => ({ db, auth, messaging, portalUrl: PORTAL_URL.value(), now: () => new Date() });
const SCHED = { timeZone: 'Asia/Manila', retryCount: 1 };

export const expireLinksJob = onSchedule({ schedule: '10 1 * * *', ...SCHED }, () => expireLinks(jobDeps()));
export const pruneDevicesJob = onSchedule({ schedule: '40 1 * * *', ...SCHED }, () => pruneDevices(jobDeps()));
export const reconcileEventsJob = onSchedule({ schedule: '20 2 * * *', ...SCHED }, () => reconcileEvents(jobDeps()));

export const onParentPortalSettingsChanged = onDocumentWritten('settings/parent_portal', (event) =>
  auditSettingsChange(db, { before: event.data?.before?.data() || null, after: event.data?.after?.data() || null }));
