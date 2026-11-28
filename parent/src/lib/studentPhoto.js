// Learner photos as the Parent App shows them. The bytes come from a callable and
// are held in memory only: never on the device, and never past the account.
import S from '../strings.js';

export const photoDataUrl = (photo) => (photo?.contentBase64 ? `data:image/jpeg;base64,${photo.contentBase64}` : '');

// fetchPhoto(studentId) resolves to the callable's { photo }. One request per
// learner and version; clear() also silences requests that are still running.
export function createPhotoCache(fetchPhoto) {
  const entries = new Map();
  let generation = 0;
  return {
    load(studentId, version) {
      const key = `${studentId}:${version}`;
      if (!entries.has(key)) {
        const mine = generation;
        const request = Promise.resolve().then(() => fetchPhoto(studentId)).then(
          (answer) => (mine === generation ? photoDataUrl(answer?.photo) : ''),
          (error) => { if (entries.get(key) === request) entries.delete(key); throw error; },
        );
        entries.set(key, request);
      }
      return entries.get(key);
    },
    clear() { generation += 1; entries.clear(); },
  };
}

// The version to ask for on a learner's page. `learner` can still be the one from
// the page just left, and a denied read means no photo either.
export const photoVersion = (learner, error, studentId) => (
  !error && learner?.id === studentId ? learner.photoUpdatedAt?.seconds : undefined
);

export const canManagePhotos = (roster, sectionId, ended) => (
  !ended && roster?.canEditPhotos === true && roster.section?.id === sectionId
);
// Temporary pass requests act on one class: offered only while that class's list is the one on screen.
export const canRequestPasses = (roster, sectionId, ended) => (
  !ended && Boolean(sectionId) && roster?.section?.id === sectionId
);

export const photoCountText = (done, total) => S.photoCount.replace('{n}', done).replace('{total}', total);
