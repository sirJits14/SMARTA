import { httpsCallable } from 'firebase/functions';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, functions } from '../firebase.js';

const fn = (name) => async (data) => (await httpsCallable(functions, name)(data)).data;

// Every staff action on the parent portal goes through a callable so it is
// validated and audited server-side (spec §8). Names match functions/index.js.
export const call = {
  issueActivationCodes: fn('issueActivationCodesFn'),
  revokeCode: fn('revokeCodeFn'),
  resolveAccessRequest: fn('resolveAccessRequestFn'),
  revokeLink: fn('revokeLinkFn'),
  setActivationRestricted: fn('setActivationRestrictedFn'),
  registerKiosk: fn('registerKioskFn'),
  deactivateKiosk: fn('deactivateKioskFn'),
  resolveReport: fn('resolveReportFn'),
  correctEvent: fn('correctEventFn'),
  addManualEvent: fn('addManualEventFn'),
};

// The pause switch and banners are a direct staff write; the
// onParentPortalSettingsChanged trigger records the audit entry.
export const updatePortalSettings = (fields, me) =>
  setDoc(doc(db, 'settings', 'parent_portal'), { ...fields, updatedBy: me.email, updatedAt: serverTimestamp() }, { merge: true });
