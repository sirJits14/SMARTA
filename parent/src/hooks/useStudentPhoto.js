import { useEffect, useState } from 'react';
import { auth, callable } from '../firebase.js';
import { createPhotoCache } from '../lib/studentPhoto.js';

const photos = createPhotoCache((studentId) => callable('getStudentPhotoFn')({ studentId }).then((result) => result.data));
// Sign-out and account changes: the next account must not see these photos.
export const forgetStudentPhotos = photos.clear;

// The learner's photo as a data URL, or '' (none asked for, loading or refused).
// No version, no request.
export function useStudentPhoto(studentId, version) {
  const key = studentId && version ? `${auth.currentUser?.uid || ''}:${studentId}:${version}` : '';
  const [loaded, setLoaded] = useState({ key: '', src: '' });
  useEffect(() => {
    if (!key) return undefined;
    let current = true;
    photos.load(studentId, version).then((src) => { if (current) setLoaded({ key, src }); }, () => {});
    return () => { current = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  // Only the answer for what is asked now: never the previous learner's picture.
  return key && loaded.key === key ? loaded.src : '';
}
