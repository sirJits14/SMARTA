import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';

const call = async (name, data) => (await httpsCallable(functions, name)(data)).data;

// temp_passes is written only by these callables (functions/src/handlers/tempPasses.js).
// { issued: [{ studentId, code }], skipped: [{ studentId, reason }] }; at most 200 learners a call.
export const issueTempPasses = (studentIds) => call('issueTempPassFn', { studentIds });
// { revoked: 0 | 1 }; administrators only.
export const revokeTempPass = (studentId) => call('revokeTempPassFn', { studentId });
