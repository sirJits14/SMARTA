import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) initializeApp();

export const db = getFirestore();
export const messaging = getMessaging();
export const auth = getAuth();
export { FieldValue, Timestamp };
