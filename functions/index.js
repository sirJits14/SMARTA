import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineString } from 'firebase-functions/params';
import { db, messaging } from './src/admin.js';
import { handleScanEvent } from './src/handlers/scanEvent.js';

setGlobalOptions({ region: 'asia-southeast1', minInstances: 0, maxInstances: 10, memory: '256MiB' });

export const PORTAL_URL = defineString('PORTAL_URL', { default: 'https://bnhs-parent.web.app' });

const deps = () => ({ db, messaging, portalUrl: PORTAL_URL.value(), now: () => new Date() });

export const onScanEventCreated = onDocumentCreated({ document: 'scan_events/{eventId}', retry: true }, async (event) => {
  const snap = event.data;
  if (!snap) return;
  await handleScanEvent(deps(), { eventId: event.params.eventId, data: snap.data() });
});
