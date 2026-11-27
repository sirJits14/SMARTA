// One-off for the staff-roles release: give every pre-roles profile an
// explicit role and bind it to its Auth account (uid). Dry run unless
// --apply; run the dry run BEFORE deploying and fix every WARNING. Needs
// Application Default Credentials for the project (e.g.
// `gcloud auth application-default login`). Run from the repo root:
//   node functions/scripts/backfillUserRoles.mjs <projectId>
//   node functions/scripts/backfillUserRoles.mjs <projectId> --apply
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { roleBackfill } from '../src/lib/roleBackfill.js';
import { roleOf } from '../../shared/staffRoles.js';

const [projectId, flag] = process.argv.slice(2);
if (!projectId) { console.error('Usage: node functions/scripts/backfillUserRoles.mjs <projectId> [--apply]'); process.exit(1); }
initializeApp({ projectId });
const db = getFirestore();
const auth = getAuth();

async function authUid(email) {
  try { return (await auth.getUserByEmail(email)).uid; }
  catch (e) { if (e.code === 'auth/user-not-found') return null; throw e; }
}

const snap = await db.collection('users').get();
const changes = [];
let warnings = 0;
for (const d of snap.docs) {
  const profile = d.data();
  if (roleOf(profile) === null) {
    warnings++;
    console.log(`WARNING ${d.id}: unrecognised role ${JSON.stringify(profile.role)} -- this account loses access after deploy. Fix the role (admin, jhs_coord, shs_coord, glc) or delete the profile.`);
  }
  const uid = profile.uid ? null : await authUid(d.id);
  if (!profile.uid && !uid) {
    warnings++;
    console.log(`WARNING ${d.id}: no sign-in exists for this profile -- delete it, or re-create it from the Accounts page.`);
  }
  const patch = roleBackfill(profile, uid);
  if (patch) changes.push({ id: d.id, patch });
}
for (const c of changes) console.log(`${c.id}: ${JSON.stringify(c.patch)}`);
if (flag !== '--apply') {
  console.log(`Dry run: ${changes.length} profile(s) would change, ${warnings} warning(s). Re-run with --apply to write.`);
} else {
  for (const c of changes) await db.doc(`users/${c.id}`).update(c.patch);
  console.log(`Updated ${changes.length} profile(s), ${warnings} warning(s).`);
}
