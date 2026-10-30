// Dry-run by default; uses Application Default Credentials for live Firestore.
// node functions/scripts/backfillApprovedCards.mjs <projectId> [--apply]
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { backfillApprovedCards } from '../src/lib/approvedCardBackfill.js';

const [projectId, flag, ...extra] = process.argv.slice(2);
if (!projectId || projectId.startsWith('-') || (flag && flag !== '--apply') || extra.length) {
  console.error('Usage: node functions/scripts/backfillApprovedCards.mjs <projectId> [--apply]');
  process.exit(1);
}
const app = initializeApp({ projectId });
const db = getFirestore(app);
try {
  const result = await backfillApprovedCards(db, { apply: flag === '--apply' });
  console.log(JSON.stringify({ projectId, mode: flag === '--apply' ? 'apply' : 'dry-run',
    emulator: Boolean(process.env.FIRESTORE_EMULATOR_HOST), added: result.added.length, skipped: result.skipped }, null, 2));
} catch (error) {
  console.error(`Backfill failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await db.terminate();
  await deleteApp(app);
}
