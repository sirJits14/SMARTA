// Dry-run by default. Pause staff account management and password/email changes
// for the migration. ADC required; no school records or credentials are output.
// node functions/scripts/backfillStaffProfileBindings.mjs <projectId> [--apply]
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { planStaffProfileBindings } from '../src/lib/staffProfileBindings.js';

const [projectId, flag, ...extra] = process.argv.slice(2);
if (!projectId || (flag && flag !== '--apply') || extra.length) {
  console.error('Usage: node functions/scripts/backfillStaffProfileBindings.mjs <projectId> [--apply]');
  process.exit(1);
}
initializeApp({ projectId });
const db = getFirestore();
const auth = getAuth();
const profiles = await db.collection('users').get();
const indexes = await db.collection('staff_profiles').get();
const authUsers = [];
let pageToken;
do {
  const page = await auth.listUsers(1000, pageToken);
  authUsers.push(...page.users.map(user => ({ uid: user.uid, email: user.email })));
  pageToken = page.pageToken;
} while (pageToken);
const plan = planStaffProfileBindings({
  profiles: profiles.docs.map(doc => ({ uid: doc.data().uid, email: doc.id })),
  indexes: indexes.docs.map(doc => ({ uid: doc.id, email: doc.data().email })), authUsers,
});
const warningCounts = {};
for (const warning of plan.warnings) warningCounts[warning.reason] = (warningCounts[warning.reason] || 0) + 1;
console.log(JSON.stringify({ mode: flag === '--apply' ? 'apply' : 'dry-run', profiles: profiles.size,
  changes: plan.changes.length, warnings: plan.warnings.length, warningCounts }));
if (plan.warnings.length) {
  console.error('Resolve every account identity warning before applying or releasing. No writes made.');
  process.exitCode = 1;
} else if (flag === '--apply') {
  // Verify all source documents still match their reviewed snapshots. A
  // single transaction commits the complete binding set or none of it.
  if (plan.changes.length > 200) throw new Error('More than 200 accounts need binding; split and review the migration before applying.');
  await db.runTransaction(async tx => {
    const snapshots = await Promise.all(plan.changes.map(change => tx.get(db.doc(`users/${change.email}`))));
    const indexed = await Promise.all(plan.changes.map(change => tx.get(db.doc(`staff_profiles/${change.uid}`))));
    for (let i = 0; i < plan.changes.length; i++) {
      const change = plan.changes[i];
      const source = profiles.docs.find(doc => doc.id === change.email);
      if (!snapshots[i].exists || !snapshots[i].updateTime.isEqual(source.updateTime)) throw new Error('Staff profiles changed. Rerun the dry-run.');
      if (indexed[i].exists && indexed[i].data().email !== change.email) throw new Error('Staff index changed. Rerun the dry-run.');
    }
    for (let i = 0; i < plan.changes.length; i++) {
      const change = plan.changes[i];
      if (!indexed[i].exists) tx.create(db.doc(`staff_profiles/${change.uid}`), { email: change.email });
      if (change.bindUid) tx.update(db.doc(`users/${change.email}`), { uid: change.uid, updatedAt: FieldValue.serverTimestamp() });
    }
  });
  console.log(`Applied ${plan.changes.length} staff identity binding(s).`);
}
