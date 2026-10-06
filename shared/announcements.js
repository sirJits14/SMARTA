// Pure announcement helpers shared by the SIMS (src/), the Parents Portal
// (parent/) and Cloud Functions (functions/, copied by scripts/syncShared.mjs).
// Spec: docs/superpowers/specs/2026-10-05-announcements-design.md
import { ALL_GRADES, roleOf, scopedGrades } from './staffRoles.js';

export const TITLE_MAX = 120;
export const BODY_MAX = 5000;
export const MAX_PINNED = 3;
export const ALL_KEY = 'all';
export const gradeKey = (g) => `g${g}`;
export const POST_KEYS = [ALL_KEY, ...ALL_GRADES.map(gradeKey)];

// The keys stored on a post: ['all'] for everyone, else its grades as g-keys.
export function postAudienceKeys(audience) {
  if (audience?.all) return [ALL_KEY];
  const grades = [...new Set((audience?.grades || []).map(Number))]
    .filter((g) => ALL_GRADES.includes(g))
    .sort((a, b) => a - b);
  return grades.map(gradeKey);
}

// The keys stored on a guardian: school-wide posts plus their learners'
// grades. A guardian without a graded learner sees nothing.
export function audienceKeysFor(grades) {
  const keys = postAudienceKeys({ grades });
  return keys.length ? [ALL_KEY, ...keys] : [];
}

export const canPostToAll = (profile) => roleOf(profile) === 'admin';
export const postableGrades = (profile) => scopedGrades(profile) ?? ALL_GRADES;

// Mirrors postKeysInScope() in firestore.rules -- keep the two in step.
export function coversPostKeys(profile, keys) {
  if (!roleOf(profile) || !keys?.length) return false;
  if (canPostToAll(profile)) return true;
  const allowed = postableGrades(profile).map(gradeKey);
  return keys.every((k) => allowed.includes(k));
}

export function toMillis(t) {
  if (t == null) return null;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (t instanceof Date) return t.getTime();
  return Number(t);
}

// Published and not past its expiry -- the publish job can run late, so
// readers check expiresAt themselves too.
export function isVisibleToParents(post, nowMs) {
  if (post?.status !== 'published') return false;
  const ends = toMillis(post.expiresAt);
  return ends == null || ends > nowMs;
}

export const manilaDateTime = (date, time) => new Date(`${date}T${time}:00+08:00`);
export const endOfManilaDay = (date) => new Date(`${date}T23:59:59.999+08:00`);
