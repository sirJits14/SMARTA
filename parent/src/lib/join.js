import { isDepedEmail } from '../../../shared/schoolAccess.js';
import { normalizeCode } from './qrScan.js';

// "Who are you?" (spec 2026-10-20): Parent/Guardian, Class Adviser, or both.
export const JOIN_ROLES = ['family', 'adviser'];

export function heldRoles(context, familyLinks = []) {
  const roles = (context?.assignments || []).map((a) => a.role).filter((r) => r !== 'family' && JOIN_ROLES.includes(r));
  return [...new Set([...roles, ...(familyLinks.length ? ['family'] : [])])];
}

export function roleOptions({ held = [], selected = [], email = '' }) {
  const deped = isDepedEmail(email);
  return JOIN_ROLES.flatMap((key) => {
    // A parent may always link another learner, so Parent/Guardian is never locked.
    if (key === 'family') return [{ key, state: selected.includes(key) ? 'selected' : 'available', active: held.includes(key) }];
    if (held.includes(key)) return [{ key, state: 'held', active: true }];
    // Only DepEd accounts can become a Class Adviser by themselves (spec 2026-10-21).
    if (!deped) return [];
    return [{ key, state: selected.includes(key) ? 'selected' : 'available', active: false }];
  });
}

// Settings › Add a role: only DepEd accounts are told about Class Adviser (spec 2026-10-21).
export const addRoleHint = (email, strings) => (isDepedEmail(email) ? strings.addRoleRowHint : strings.addRoleRowHintParent);

export function toggleRole(selected, key, options) {
  const option = options.find((o) => o.key === key);
  if (!option || option.state === 'held') return selected;
  return selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
}

export const joinSteps = (options) => options.filter((o) => o.state === 'selected').map((o) => o.key);

export function initialSelection(query = {}) {
  if (query.a) return ['adviser'];
  if (query.c || query.role === 'family') return ['family'];
  if (query.role === 'adviser') return ['adviser'];
  return [];
}
export const codeDraft = (value) => normalizeCode(value).slice(0, 8);
export const initialCode = (query = {}, role) => codeDraft((role === 'adviser' ? query.a : role === 'family' ? query.c : '') || '');
export const prettyCode = (value) => (value.length > 4 ? `${value.slice(0, 4)}-${value.slice(4)}` : value);

// Where "Open the app" lands. Roles just claimed (results) and roles the account
// already holds (assignments, e.g. a Curriculum Adviser assigned by the school)
// both count; a family link or Parent/Guardian result keeps the account in Family.
export function landingModeFor(results = {}, familyLinks = [], assignments = []) {
  const active = (role) => results[role]?.outcome === 'active';
  const assigned = (role) => assignments.some((a) => a.role === role);
  const school = active('adviser') || assignments.some((a) => a.role && a.role !== 'family');
  const family = active('family') || familyLinks.length > 0;
  return school && !family ? { view: 'school', hasClass: active('adviser') || assigned('adviser') } : { view: 'family', hasClass: false };
}
