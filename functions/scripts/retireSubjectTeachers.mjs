// Production route for the one-off Subject Teacher cleanup (spec 2026-10-20).
// retireSubjectTeachersFn enforces App Check, so it cannot be called from a
// console; this runs the same handler directly with the Admin SDK. Counts only
// unless --apply. Needs Application Default Credentials (the emulator needs none).
// Run from the repo root after `node scripts/syncShared.mjs` and the functions deploy:
//   node functions/scripts/retireSubjectTeachers.mjs --project <projectId> --admin <administrator email>
//   node functions/scripts/retireSubjectTeachers.mjs --project <projectId> --admin <administrator email> --apply
import { initializeApp, applicationDefault, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { retireSubjectTeachers } from '../src/handlers/retireSubjectTeachers.js';
import { roleOf } from '../../shared/staffRoles.js';

const usage = 'Usage: node functions/scripts/retireSubjectTeachers.mjs --project <projectId> --admin <administrator email> [--apply]';
const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const rest = argv.filter(a => a !== '--apply');
const flag = name => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
const projectId = flag('--project');
const adminEmail = flag('--admin')?.trim().toLowerCase();
if (!projectId || !adminEmail || projectId.startsWith('-') || adminEmail.startsWith('-') || rest.length !== 4) {
  console.error(usage);
  process.exit(1);
}
const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const app = initializeApp(emulator ? { projectId } : { projectId, credential: applicationDefault() });
const db = getFirestore(app);
try {
  const profile = (await db.doc(`users/${adminEmail}`).get()).data();
  if (!profile) throw new Error(`No staff profile for ${adminEmail}.`);
  if (!profile.uid) throw new Error(`${adminEmail} has no uid; sign in to SIMS once first.`);
  if (roleOf(profile) !== 'admin') throw new Error(`${adminEmail} is not an administrator.`);
  const result = await retireSubjectTeachers({ db, auth: getAuth(app), now: () => new Date(),
    uid: profile.uid, email: adminEmail, authTime: Math.floor(Date.now() / 1000) }, { apply });
  console.log(JSON.stringify({ projectId, admin: adminEmail, emulator, mode: apply ? 'apply' : 'dry-run', ...result }, null, 2));
} catch (error) {
  console.error(`Cleanup failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await db.terminate();
  await deleteApp(app);
}
