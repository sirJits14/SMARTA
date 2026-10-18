import { collection, query, where, limit } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useQuery } from './useDoc.js';
import { isFamilyLink } from '../../../shared/schoolAccess.js';

// `adviserLinks` are active Adviser links (old adviser slips, or family links
// moved to Adviser). They grant nothing now; Home tells DepEd accounts what to
// do instead.
export function useLinks(uid) {
  const { rows } = useQuery(() => uid && query(collection(db, 'guardian_links'), where('guardianUid', '==', uid), where('status', '==', 'active'), limit(60)), [uid], uid && `links:${uid}`);
  return { links: rows?.filter(isFamilyLink), adviserLinks: rows?.filter((l) => !isFamilyLink(l)) };
}
