import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

if (!getApps().length) initializeApp();

export const db = getFirestore();
export const messaging = getMessaging();
export const auth = getAuth();
// A function, so a project without a bucket only fails photo calls.
export const bucket = () => getStorage().bucket();
export { FieldValue, Timestamp };
