// Plan only: never guess an identity or replace an existing conflicting index.
export function planStaffProfileBindings({ profiles, authUsers, indexes = [] }) {
  const authByUid = new Map(authUsers.map(user => [user.uid, user]));
  const authByEmail = new Map(authUsers.map(user => [user.email?.toLowerCase(), user]));
  const indexByUid = new Map(indexes.map(index => [index.uid, index.email]));
  const seen = new Set();
  const changes = [];
  const warnings = [];
  for (const profile of profiles) {
    const email = profile.email;
    const user = profile.uid ? authByUid.get(profile.uid) : authByEmail.get(email);
    if (typeof email !== 'string' || email !== email.toLowerCase() || !email.includes('@') || email.includes('/')) {
      warnings.push({ reason: 'invalid-profile-email' }); continue;
    }
    if (!user) { warnings.push({ reason: 'missing-auth-user' }); continue; }
    if (user.email?.toLowerCase() !== email) { warnings.push({ reason: 'auth-email-mismatch' }); continue; }
    if (seen.has(user.uid)) { warnings.push({ reason: 'duplicate-uid' }); continue; }
    seen.add(user.uid);
    const indexedEmail = indexByUid.get(user.uid);
    if (indexedEmail !== undefined && indexedEmail !== email) { warnings.push({ reason: 'index-conflict' }); continue; }
    if (!profile.uid || indexedEmail === undefined) changes.push({ email, uid: user.uid, bindUid: !profile.uid });
  }
  return { changes, warnings };
}
