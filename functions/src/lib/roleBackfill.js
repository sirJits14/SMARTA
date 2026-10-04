// Patch that makes a pre-roles users/{email} profile explicit, or null when
// it already is. Legacy = no role or the README's old 'registrar'.
export function roleBackfill(profile) {
  const patch = {};
  if (profile.role == null || profile.role === '' || profile.role === 'registrar') {
    patch.role = 'admin';
    patch.gradeLevel = null;
  }
  if (profile.disabled === undefined) patch.disabled = false;
  if (profile.mustChangePassword === undefined) patch.mustChangePassword = false;
  return Object.keys(patch).length ? patch : null;
}
