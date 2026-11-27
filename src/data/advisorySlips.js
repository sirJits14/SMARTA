import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';

const fn = (name) => async (data = {}) => (await httpsCallable(functions, name)(data)).data;

// Advisory slips (spec 2026-10-19). Names match functions/index.js.
export const listAdvisoryStatus = fn('listAdvisoryStatusFn');
export const issueAdvisorySlips = fn('issueAdvisorySlipsFn');
export const revokeAdvisorySlip = fn('revokeAdvisorySlipFn');
