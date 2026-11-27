import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';

const call = async (name, data, options) => (await httpsCallable(functions, name, options)(data)).data;

// temp_passes is written only by these callables (functions/src/handlers/tempPasses.js).
// { issued: [{ studentId, code }], skipped: [{ studentId, reason }] }; at most 200 learners a call.
// The function may run for its full 120 s; the client's default 70 s would give up first.
export const issueTempPasses = (studentIds) => call('issueTempPassFn', { studentIds }, { timeout: 125000 });
// { revoked: 0 | 1 }; administrators only.
export const revokeTempPass = (studentId) => call('revokeTempPassFn', { studentId });
