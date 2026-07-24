// One-time, human-run script. Copies the teacher roster from
// bnhs-attendance's `teachers` collection into bnhs-sims's `teachers`
// collection (added in this same change, firestore.rules). Not part of the
// app's runtime bundle; never imported by src/. Safe to re-run: every write
// is a setDoc keyed by the source document's own ID, never an addDoc, so
// running it twice does not create duplicates.
//
// Usage:
//   cp scripts/.env.migration.example scripts/.env.migration
//   # fill in scripts/.env.migration with real values (see that file)
//   node --env-file=scripts/.env.migration scripts/migrate-teachers-from-attendance.mjs

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required environment variable: ${name}`);
    console.error('Did you run with --env-file=scripts/.env.migration ?');
    process.exit(1);
  }
  return v;
}

const sourceApp = initializeApp({
  apiKey: requireEnv('SOURCE_FIREBASE_API_KEY'),
  authDomain: requireEnv('SOURCE_FIREBASE_AUTH_DOMAIN'),
  projectId: requireEnv('SOURCE_FIREBASE_PROJECT_ID'),
  storageBucket: requireEnv('SOURCE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: requireEnv('SOURCE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: requireEnv('SOURCE_FIREBASE_APP_ID'),
}, 'source');

const targetApp = initializeApp({
  apiKey: requireEnv('TARGET_FIREBASE_API_KEY'),
  authDomain: requireEnv('TARGET_FIREBASE_AUTH_DOMAIN'),
  projectId: requireEnv('TARGET_FIREBASE_PROJECT_ID'),
  storageBucket: requireEnv('TARGET_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: requireEnv('TARGET_FIREBASE_MESSAGING_SENDER_ID'),
  appId: requireEnv('TARGET_FIREBASE_APP_ID'),
}, 'target');

const sourceDb = getFirestore(sourceApp);
const targetDb = getFirestore(targetApp);
const targetAuth = getAuth(targetApp);

async function main() {
  await signInWithEmailAndPassword(
    targetAuth,
    requireEnv('TARGET_USER_EMAIL'),
    requireEnv('TARGET_USER_PASSWORD')
  );
  console.log('Signed in to bnhs-sims as', targetAuth.currentUser.email);

  const snap = await getDocs(collection(sourceDb, 'teachers'));
  console.log(`Found ${snap.size} teacher(s) in bnhs-attendance.`);

  let count = 0;
  for (const teacherDoc of snap.docs) {
    const { empId, name, dept, shift } = teacherDoc.data();
    await setDoc(doc(targetDb, 'teachers', teacherDoc.id), { empId, name, dept, shift });
    count++;
    console.log(`  copied ${teacherDoc.id}: ${empId} - ${name}`);
  }

  console.log(`Done. Copied ${count} teacher(s) into bnhs-sims.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
