import { isDepedEmail, conflictingRole } from '../../../shared/schoolAccess.js';
import { normalizeCode } from './qrScan.js';

// "Who are you?" (spec 2026-10-19). Family can pair with one school role;
// Class Adviser and Subject Teacher never go together.
export const JOIN_ROLES = ['family', 'adviser', 'subject_teacher'];

export function heldRoles(context, familyLinks = []) {
  const roles = (context?.assignments || []).map((a) => a.role).filter((r) => r !== 'family' && JOIN_ROLES.includes(r));
  return [...new Set([...roles, ...(familyLinks.length ? ['family'] : [])])];
}
export const pendingRoles = (context) => (context?.myRequests || []).filter((r) => r.status === 'pending').map((r) => r.role);

export function roleOptions({ held = [], pending = [], selected = [], email = '' }) {
  const deped = isDepedEmail(email);
  return JOIN_ROLES.map((key) => {
    // A parent may always link another learner, so Family is never locked.
    if (key === 'family') return { key, state: selected.includes(key) ? 'selected' : 'available', active: held.includes(key), needsApproval: false };
    if (held.includes(key)) return { key, state: 'held', active: true, needsApproval: false };
    const blocked = conflictingRole([...held, ...pending, ...selected], key);
    return { key, state: blocked ? 'blocked' : selected.includes(key) ? 'selected' : 'available', active: false, needsApproval: !deped };
  });
}

export function toggleRole(selected, key, options) {
  const option = options.find((o) => o.key === key);
  if (!option || option.state === 'held' || option.state === 'blocked') return selected;
  return selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
}

export const joinSteps = (options) => options.filter((o) => o.state === 'selected').map((o) => o.key);

export function initialSelection(query = {}) {
  if (query.a) return ['adviser'];
  if (query.c || query.role === 'family') return ['family'];
  if (query.role === 'adviser' || query.role === 'subject_teacher') return [query.role];
  return [];
}
export const codeDraft = (value) => normalizeCode(value).slice(0, 8);
export const initialCode = (query = {}, role) => codeDraft((role === 'adviser' ? query.a : role === 'family' ? query.c : '') || '');
export const prettyCode = (value) => (value.length > 4 ? `${value.slice(0, 4)}-${value.slice(4)}` : value);

// Where "Open the app" lands. Roles just claimed (results) and roles the account
// already holds (assignments, e.g. a Curriculum Adviser assigned by the school)
// both count; a family link or Family result keeps the account in Family.
export function landingModeFor(results = {}, familyLinks = [], assignments = []) {
  const active = (role) => results[role]?.outcome === 'active';
  const assigned = (role) => assignments.some((a) => a.role === role);
  const school = active('adviser') || active('subject_teacher') || assignments.some((a) => a.role && a.role !== 'family');
  const family = active('family') || familyLinks.length > 0;
  return school && !family ? { view: 'school', hasClass: active('adviser') || assigned('adviser') } : { view: 'family', hasClass: false };
}
