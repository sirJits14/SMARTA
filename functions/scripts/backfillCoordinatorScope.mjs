// Dry-run-first metadata migration. Pause enrollment, attendance and section
// writers for an apply window: collection scans are not a consistent snapshot.
// Target update-time preconditions prevent overwriting concurrent target edits,
// but cannot detect an enrollment/section change after its source scan.
// Local: FIRESTORE_EMULATOR_HOST is honored by the Admin SDK, no credentials needed.
// Live release (separate approval): Application Default Credentials are required.
//   node functions/scripts/backfillCoordinatorScope.mjs <projectId> [--apply]
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { planCoordinatorScopeBackfill } from '../src/lib/coordinatorScope.js';

const args = process.argv.slice(2);
const [projectId, flag] = args;
if (!projectId || projectId.startsWith('-') || args.length > 2 || (flag && flag !== '--apply')) {
  console.error('Usage: node functions/scripts/backfillCoordinatorScope.mjs <projectId> [--apply]');
  process.exit(1);
}
const app = initializeApp({ projectId });
const db = getFirestore(app);
try {
  const settings = await db.doc('settings/app').get();
  const names = ['students', 'enrollments', 'sections', 'student_attendance', 'schedules'];
  const snapshots = await Promise.all(names.map(name => db.collection(name).get()));
  const records = Object.fromEntries(names.map((name, i) => [name, snapshots[i].docs.map(doc => ({ ...doc.data(), id: doc.id }))]));
  const versions = new Map(snapshots.flatMap(s => s.docs.map(doc => [doc.ref.path, doc.updateTime])));
  const { changes, warnings } = planCoordinatorScopeBackfill({
    ...records, attendance: records.student_attendance, schoolYear: settings.data()?.currentSchoolYear,
  });
  console.log(`Project: ${projectId}; ${process.env.FIRESTORE_EMULATOR_HOST ? 'Firestore emulator' : 'live Firestore'}; current year: ${settings.data()?.currentSchoolYear}`);
  for (const warning of warnings) console.log(`WARNING ${warning.path}: ${warning.message}`);
  for (const change of changes) console.log(`${change.path}: ${JSON.stringify(change.patch)}`);
  if (flag !== '--apply') {
    console.log(`Dry run: ${changes.length} record(s) would change, ${warnings.length} warning(s). Re-run with --apply to write; resolve every warning before restrictive rules are released.`);
  } else {
    // Chunked commits are not all-or-nothing across the migration. Repeat a dry
    // run after any failure; completed patches are idempotent.
    for (let start = 0; start < changes.length; start += 500) {
      const batch = db.batch();
      for (const change of changes.slice(start, start + 500)) {
        batch.update(db.doc(change.path), change.patch, { lastUpdateTime: versions.get(change.path) });
      }
      await batch.commit();
    }
    console.log(`Updated ${changes.length} record(s), ${warnings.length} warning(s). Resolve every warning before restrictive rules are released.`);
  }
} catch (error) {
  console.error(`Backfill failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await db.terminate();
  await deleteApp(app);
}
