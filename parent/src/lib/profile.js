// guardians/{uid} as the app reads it. A field just written with
// serverTimestamp() keeps its previous value until the server confirms the
// write. Firestore's default would read it as null meanwhile, and a null
// announcementsSeenAt means "never opened Notices" -- which flashed the
// Notices dot on every visit until the write landed.
export const profileFrom = (snap) => ({ id: snap.id, ...snap.data({ serverTimestamps: 'previous' }) });
