import { addDoc, collection, deleteDoc, doc, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../firebase.js';
import { postAudienceKeys, manilaDateTime, endOfManilaDay } from '../../shared/announcements.js';
import { audienceOf } from '../lib/announcements.js';

// Staff write announcements directly; firestore.rules enforces scope, shape
// and the allowed status moves. Functions own pushedAt/pushResult.
// Guardians can read createdBy/updatedBy: a name only, never the staff email.
const author = (me) => ({ uid: auth.currentUser.uid, name: me.name || 'BNHS staff' });
const touch = (me) => ({ updatedBy: author(me), updatedAt: serverTimestamp() });
const expiresAtOf = (f) => (f.expires ? Timestamp.fromDate(endOfManilaDay(f.expires)) : null);
const ref = (post) => doc(db, 'announcements', post.id);

export const announcements = {
  create(f, me) {
    const audience = audienceOf(f);
    const timing = f.when === 'now'
      ? { status: 'published', publishAt: serverTimestamp(), publishedAt: serverTimestamp() }
      : { status: 'scheduled', publishAt: Timestamp.fromDate(manilaDateTime(f.date, f.time)) };
    return addDoc(collection(db, 'announcements'), {
      title: f.title.trim(), body: f.body.trim(), audience, audienceKeys: postAudienceKeys(audience),
      expiresAt: expiresAtOf(f), pinned: f.pinned, push: f.push,
      createdBy: author(me), createdAt: serverTimestamp(), ...touch(me), ...timing,
    });
  },
  // Scheduled: every field. Live: wording, pin and expiry only; "Edited"
  // (editedAt) only when the wording changed.
  update(post, f, me) {
    const title = f.title.trim(), body = f.body.trim();
    const common = { title, body, pinned: f.pinned, expiresAt: expiresAtOf(f), ...touch(me) };
    if (post.status === 'published') {
      const reworded = title !== post.title || body !== post.body;
      return updateDoc(ref(post), { ...common, ...(reworded ? { editedAt: serverTimestamp() } : {}) });
    }
    const audience = audienceOf(f);
    return updateDoc(ref(post), {
      ...common, audience, audienceKeys: postAudienceKeys(audience), push: f.push,
      publishAt: Timestamp.fromDate(manilaDateTime(f.date, f.time)),
    });
  },
  unpublish: (post, me) => updateDoc(ref(post), { status: 'unpublished', ...touch(me) }),
  remove: (post) => deleteDoc(ref(post)),
  audienceCount: async (audienceKeys) => (await httpsCallable(functions, 'announcementAudienceCountFn')({ audienceKeys })).data.count,
};
