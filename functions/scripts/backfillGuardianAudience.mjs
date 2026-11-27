// One-off for the announcements release: give every existing guardian their
// audienceKeys. Safe to re-run (it only writes keys that differ). Dry run
// unless --apply. Needs Application Default Credentials for the project
// (e.g. `gcloud auth application-default login`). Run from the repo root
// AFTER deploying functions, so new activations are already handled:
//   node scripts/syncShared.mjs
//   node functions/scripts/backfillGuardianAudience.mjs <projectId>
//   node functions/scripts/backfillGuardianAudience.mjs <projectId> --apply
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { refreshGuardianAudience } from '../src/handlers/guardianAudience.js';

const [projectId, flag] = process.argv.slice(2);
if (!projectId) { console.error('Usage: node functions/scripts/backfillGuardianAudience.mjs <projectId> [--apply]'); process.exit(1); }
initializeApp({ projectId });
const db = getFirestore();

const guardians = await db.collection('guardians').get();
if (flag !== '--apply') {
  const withLinks = new Set((await db.collection('guardian_links').where('status', '==', 'active').get()).docs.map((d) => d.data().guardianUid));
  const missing = guardians.docs.filter((g) => !Array.isArray(g.data().audienceKeys)).length;
  console.log(`Dry run: ${guardians.size} guardian(s), ${withLinks.size} with an active link, ${missing} without audienceKeys. Re-run with --apply to write.`);
} else {
  let n = 0;
  for (const g of guardians.docs) { await refreshGuardianAudience(db, g.id); n++; }
  console.log(`Refreshed audienceKeys for ${n} guardian(s).`);
}
