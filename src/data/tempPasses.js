import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';

const call = async (name, data, options) => (await httpsCallable(functions, name, options)(data)).data;

// temp_passes is written only by these callables (functions/src/handlers/tempPasses.js).
// { issued: [{ studentId, code }], skipped: [{ studentId, reason }] }; at most 200 learners a call.
// The function may run for its full 120 s; the client's default 70 s would give up first.
export const issueTempPasses = (studentIds) => call('issueTempPassFn', { studentIds }, { timeout: 125000 });
// { revoked: 0 | 1 }; administrators only.
export const revokeTempPass = (studentId) => call('revokeTempPassFn', { studentId });

// Adviser requests (functions/src/handlers/tempPassRequests.js).
// { requests, truncated }; status 'pending' (oldest first), 'printed' or 'declined' (newest first); at most 200.
export const listTempPassRequests = (status) => call('listTempPassRequestsFn', { status });
// { issued: [{ requestId, studentId, code }], skipped: [{ requestId, studentId, reason }] }; at most 200 a call.
// Preparing a request again returns the code it already produced.
export const fulfilTempPassRequests = (requestIds) => call('fulfilTempPassRequestsFn', { requestIds }, { timeout: 125000 });
// { printed }: requests whose prepared pass is still live are closed and their advisers notified.
export const markTempPassRequestsPrinted = (requestIds) => call('markTempPassRequestsPrintedFn', { requestIds });
// { ok: true }; refused once the request's pass is prepared.
export const declineTempPassRequest = (requestId, reason) => call('declineTempPassRequestFn', { requestId, reason });
