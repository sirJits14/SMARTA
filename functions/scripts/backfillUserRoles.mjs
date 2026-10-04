// One-off after deploying staff roles: give every pre-roles profile an
// explicit role. Dry run unless --apply. Needs Application Default
// Credentials for the project (e.g. `gcloud auth application-default login`).
//   node functions/scripts/backfillUserRoles.mjs <projectId>
//   node functions/scripts/backfillUserRoles.mjs <projectId> --apply
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { roleBackfill } from '../src/lib/roleBackfill.js';

const [projectId, flag] = process.argv.slice(2);
if (!projectId) { console.error('Usage: node functions/scripts/backfillUserRoles.mjs <projectId> [--apply]'); process.exit(1); }
initializeApp({ projectId });
const db = getFirestore();

const snap = await db.collection('users').get();
const changes = snap.docs.map((d) => ({ id: d.id, patch: roleBackfill(d.data()) })).filter((c) => c.patch);
for (const c of changes) console.log(`${c.id}: ${JSON.stringify(c.patch)}`);
if (flag !== '--apply') {
  console.log(`Dry run: ${changes.length} profile(s) would change. Re-run with --apply to write.`);
} else {
  for (const c of changes) await db.doc(`users/${c.id}`).update(c.patch);
  console.log(`Updated ${changes.length} profile(s).`);
}
