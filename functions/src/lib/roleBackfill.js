// Patch that makes a pre-roles users/{email} profile explicit, or null when
// it already is. Legacy = no role or the README's old 'registrar'. `uid` (the
// Auth account found for the email, if any) binds an unbound profile to it.
export function roleBackfill(profile, uid = null) {
  const patch = {};
  if (profile.role == null || profile.role === '' || profile.role === 'registrar') {
    patch.role = 'admin';
    patch.gradeLevel = null;
  }
  if (profile.disabled === undefined) patch.disabled = false;
  if (profile.mustChangePassword === undefined) patch.mustChangePassword = false;
  if (uid && !profile.uid) patch.uid = uid;
  return Object.keys(patch).length ? patch : null;
}
