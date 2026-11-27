import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';

const fn = (name) => async (data) => (await httpsCallable(functions, name)(data)).data;

// Every account change goes through a callable (functions/src/handlers/users.js),
// which validates, enforces the admin safeguards, and audits it.
export const staffUsers = {
  create: fn('createStaffUserFn'),
  update: fn('updateStaffUserFn'),
  setDisabled: fn('setStaffUserDisabledFn'),
  resetPassword: fn('resetStaffPasswordFn'),
  remove: fn('deleteStaffUserFn'),
  changeOwnPassword: fn('changeOwnPasswordFn'),
};
