import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useQuery } from './useDoc.js';

// Published posts for this guardian's audience keys, newest first. The
// rules accept exactly this shape: the guardian's own keys, status ==
// 'published', and a limit ≤ 50. No keys (no active link) → no posts.
export function useAnnouncements(profile, max) {
  const keys = profile?.audienceKeys || [];
  const signature = keys.join(',');
  const { rows, error } = useQuery(() => (keys.length
    ? query(collection(db, 'announcements'), where('audienceKeys', 'array-contains-any', keys), where('status', '==', 'published'), orderBy('publishedAt', 'desc'), limit(max))
    : null), [signature, max]);
  if (!keys.length) return { rows: profile ? [] : undefined, error: null };
  return { rows, error };
}
