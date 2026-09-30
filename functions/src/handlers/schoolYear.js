import { FieldValue } from 'firebase-admin/firestore';
import { CallableError } from '../errors.js';
import { audit } from '../audit.js';
import { logEvent } from '../log.js';
import { str } from '../lib/validators.js';

// A links page can write one inbox doc per link as well, so 200 keeps every
// batch at or under 400 writes (Firestore's batch limit is 500).
const PAGE = 200;

// Runs `apply(docs, batch)` over every doc matching `query`, one page at a
// time. Each page's writes move its docs out of the query, so re-querying
// from the top always yields the next page — and a re-run after a partial
// failure picks up exactly what is left.
async function drain(db, query, apply) {
  let n = 0;
  for (;;) {
    const snap = await query.limit(PAGE).get();
    if (snap.empty) return n;
    const b = db.batch();
    await apply(snap.docs, b);
    await b.commit();
    n += snap.size;
    if (snap.size < PAGE) return n;
  }
}

// Staff. The only thing that ends a school year's slips and links (spec
// 2026-09-30 §3). The typed confirmation guards against a mis-click.
export async function endSchoolYear(ctx, data) {
  const { db, email } = ctx;
  const schoolYear = str(data.schoolYear, { name: 'schoolYear', min: 9, max: 9 });
  if (!/^\d{4}-\d{4}$/.test(schoolYear)) throw new CallableError('invalid-argument', 'schoolYear must look like 2026-2027');
  const confirmText = str(data.confirmText, { name: 'confirmText', max: 20 });
  if (confirmText !== schoolYear) throw new CallableError('invalid-argument', 'Type the school year exactly to confirm.');

  const codesRevoked = await drain(db,
    db.collection('activation_codes').where('schoolYear', '==', schoolYear).where('status', 'in', ['issued', 'exhausted']),
    (docs, b) => docs.forEach((d) => b.update(d.ref, { status: 'revoked', revokedAt: FieldValue.serverTimestamp(), revokedBy: email, revokedReason: 'school-year-ended' })));

  const notified = new Set();
  const linksExpired = await drain(db,
    db.collection('guardian_links').where('schoolYear', '==', schoolYear).where('status', '==', 'active'),
    (docs, b) => docs.forEach((d) => {
      const { guardianUid } = d.data();
      // Fixed id: one message per account per year, even across re-runs.
      // Written in the same batch as the link change, so it can't be lost.
      if (!notified.has(guardianUid)) {
        notified.add(guardianUid);
        b.set(db.doc(`guardians/${guardianUid}/inbox/sy-ended-${schoolYear}`), {
          type: 'system', title: `SY ${schoolYear} has ended`,
          body: `SY ${schoolYear} has ended. Use the new activation slip from the school to link again for the next school year.`,
          studentId: null, createdAt: FieldValue.serverTimestamp(), pushStatus: 'skipped_suppressed',
        });
      }
      b.update(d.ref, { status: 'expired', expiredAt: FieldValue.serverTimestamp(), expiredReason: 'school-year-ended' });
    }));

  const result = { codesRevoked, linksExpired, accountsNotified: notified.size };
  await audit(db, { action: 'schoolyear.ended', actorType: 'staff', actorUid: email, targetType: 'school_year', targetId: schoolYear, details: result });
  logEvent('school_year_ended', { schoolYear, ...result });
  return result;
}
