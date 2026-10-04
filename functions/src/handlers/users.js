import { FieldValue } from 'firebase-admin/firestore';
import { audit } from '../audit.js';
import { CallableError } from '../errors.js';
import { str, oneOf, int, bool } from '../lib/validators.js';
import { generatePassword } from '../lib/password.js';
import { ROLE_VALUES, roleOf } from '../../shared/staffRoles.js';

// Staff account management (spec: 2026-10-04-staff-accounts-and-roles-design.md).
// users/{email} is written only here; generated passwords are returned to the
// caller exactly once and never stored or audited.
const MIN_PASSWORD = 10;
const MAX_PASSWORD = 128;
const userRef = (db, email) => db.doc(`users/${email}`);
const failed = (message) => new CallableError('failed-precondition', message);
const duplicate = () => new CallableError('already-exists', 'An account with this email already exists.');
const now = () => FieldValue.serverTimestamp();

export function staffEmail(v) {
  const email = str(v, { name: 'Email', min: 3, max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CallableError('invalid-argument', 'Email is not a valid email address');
  return email;
}

// gradeLevel is required (7-12) for a Grade Level Coordinator and must be absent otherwise.
export function roleAndGrade(role, gradeLevel) {
  oneOf(role, ROLE_VALUES, 'Role');
  if (role === 'glc') {
    if (gradeLevel == null) throw new CallableError('invalid-argument', 'Grade level is required for a Grade Level Coordinator.');
    return { role, gradeLevel: int(gradeLevel, { name: 'Grade level', min: 7, max: 12 }) };
  }
  if (gradeLevel != null) throw new CallableError('invalid-argument', 'Grade level applies only to a Grade Level Coordinator.');
  return { role, gradeLevel: null };
}

async function loadTarget(tx, db, email) {
  const snap = await tx.get(userRef(db, email));
  if (!snap.exists) throw new CallableError('not-found', 'No such account.');
  return snap.data();
}

// Read in the same transaction as the write, so two admins demoting/disabling/
// deleting each other at once cannot both succeed. `next` is the target's
// profile after the change (null when deleting).
async function assertAdminRemains(tx, db, email, next) {
  const all = await tx.get(db.collection('users'));
  const active = all.docs.filter((d) => {
    const p = d.id === email ? next : d.data();
    return p && roleOf(p) === 'admin' && p.disabled !== true;
  });
  if (active.length === 0) throw failed('At least one active Administrator is required.');
}

// Profiles hand-made before this feature have no uid; fall back to the Auth email.
async function uidFor(auth, email, profile) {
  if (profile?.uid) return profile.uid;
  try { return (await auth.getUserByEmail(email)).uid; }
  catch (e) { if (e.code === 'auth/user-not-found') return null; throw e; }
}

const staffAudit = (db, action, actor, target, details = {}) =>
  audit(db, { action, actorType: 'staff', actorUid: actor, targetType: 'staff', targetId: target, details });

export async function createStaffUser(ctx, data) {
  const { db, auth, email: actor } = ctx;
  const name = str(data.name, { name: 'Name', min: 2, max: 80 });
  const email = staffEmail(data.email);
  const { role, gradeLevel } = roleAndGrade(data.role, data.gradeLevel);
  if ((await userRef(db, email).get()).exists) throw duplicate();
  const password = generatePassword();
  let user;
  try { user = await auth.createUser({ email, password, displayName: name }); }
  catch (e) { if (e.code === 'auth/email-already-exists') throw duplicate(); throw e; }
  try {
    await userRef(db, email).create({
      name, role, gradeLevel, disabled: false, mustChangePassword: true, uid: user.uid,
      createdBy: actor, createdAt: now(), updatedAt: now(),
    });
  } catch (e) {
    // Never leave a login behind without its profile.
    await auth.deleteUser(user.uid).catch(() => {});
    throw e;
  }
  await staffAudit(db, 'staff.created', actor, email, { role, gradeLevel });
  return { email, password };
}

export async function updateStaffUser(ctx, data) {
  const { db, email: actor } = ctx;
  const email = staffEmail(data.email);
  const name = data.name === undefined ? null : str(data.name, { name: 'Name', min: 2, max: 80 });
  const change = await db.runTransaction(async (tx) => {
    const current = await loadTarget(tx, db, email);
    const fromRole = roleOf(current);
    const nextRole = data.role === undefined ? fromRole : data.role;
    const gradeIn = 'gradeLevel' in data ? data.gradeLevel : (nextRole === 'glc' ? current.gradeLevel : null);
    const { role, gradeLevel } = roleAndGrade(nextRole, gradeIn);
    if (email === actor && role !== fromRole) throw failed("You can't change the role of your own account.");
    if (fromRole === 'admin' && role !== 'admin') await assertAdminRemains(tx, db, email, { ...current, role });
    tx.update(userRef(db, email), { role, gradeLevel, ...(name ? { name } : {}), updatedAt: now() });
    return { from: { role: fromRole, gradeLevel: current.gradeLevel ?? null }, to: { role, gradeLevel } };
  });
  await staffAudit(db, 'staff.updated', actor, email, change);
  return { ok: true };
}

export async function setStaffUserDisabled(ctx, data) {
  const { db, auth, email: actor } = ctx;
  const email = staffEmail(data.email);
  const disabled = bool(data.disabled, 'disabled');
  if (email === actor && disabled) throw failed("You can't disable your own account.");
  const profile = await db.runTransaction(async (tx) => {
    const current = await loadTarget(tx, db, email);
    if (disabled) await assertAdminRemains(tx, db, email, { ...current, disabled: true });
    tx.update(userRef(db, email), { disabled, updatedAt: now() });
    return current;
  });
  const uid = await uidFor(auth, email, profile);
  if (uid) {
    await auth.updateUser(uid, { disabled });
    if (disabled) await auth.revokeRefreshTokens(uid);
  }
  await staffAudit(db, disabled ? 'staff.disabled' : 'staff.enabled', actor, email);
  return { ok: true };
}

export async function resetStaffPassword(ctx, data) {
  const { db, auth, email: actor } = ctx;
  const email = staffEmail(data.email);
  if (email === actor) throw failed("You can't reset your own password here.");
  const snap = await userRef(db, email).get();
  if (!snap.exists) throw new CallableError('not-found', 'No such account.');
  const uid = await uidFor(auth, email, snap.data());
  if (!uid) throw new CallableError('not-found', 'This account has no sign-in. Delete it and create it again.');
  const password = generatePassword();
  await auth.updateUser(uid, { password });
  await auth.revokeRefreshTokens(uid);
  await userRef(db, email).update({ mustChangePassword: true, uid, updatedAt: now() });
  await staffAudit(db, 'staff.password_reset', actor, email);
  return { email, password };
}

export async function deleteStaffUser(ctx, data) {
  const { db, auth, email: actor } = ctx;
  const email = staffEmail(data.email);
  if (email === actor) throw failed("You can't delete your own account.");
  const profile = await db.runTransaction(async (tx) => {
    const current = await loadTarget(tx, db, email);
    await assertAdminRemains(tx, db, email, null);
    tx.delete(userRef(db, email));
    return current;
  });
  // The profile is already gone, so a leftover login is refused everywhere.
  const uid = await uidFor(auth, email, profile);
  if (uid) await auth.deleteUser(uid).catch((e) => { if (e.code !== 'auth/user-not-found') throw e; });
  await staffAudit(db, 'staff.deleted', actor, email, { role: roleOf(profile) });
  return { ok: true };
}

export async function changeOwnPassword(ctx, data) {
  const { db, auth, uid, email } = ctx;
  const pw = data.newPassword;
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD || pw.length > MAX_PASSWORD) {
    throw new CallableError('invalid-argument', `Password must be ${MIN_PASSWORD} to ${MAX_PASSWORD} characters.`);
  }
  await auth.updateUser(uid, { password: pw });
  await userRef(db, email).update({ mustChangePassword: false, uid, updatedAt: now() });
  await staffAudit(db, 'staff.password_changed', email, email);
  return { ok: true };
}
