import { CallableError } from '../errors.js';

const bad = (name, why) => new CallableError('invalid-argument', `${name} ${why}`);

export function str(v, { name, min = 0, max = 200 }) {
  if (typeof v !== 'string') throw bad(name, 'must be text');
  const t = v.trim();
  if (t.length < min) throw bad(name, 'is required');
  if (t.length > max) throw bad(name, `must be at most ${max} characters`);
  return t;
}
export function oneOf(v, allowed, name) { if (!allowed.includes(v)) throw bad(name, 'is not a valid choice'); return v; }
export function bool(v, name) { if (typeof v !== 'boolean') throw bad(name, 'must be true or false'); return v; }
export function int(v, { name, min, max }) {
  if (!Number.isInteger(v) || v < min || v > max) throw bad(name, `must be a whole number between ${min} and ${max}`);
  return v;
}
export function lrn(v) { const t = str(v, { name: 'LRN', max: 12 }); if (!/^\d{12}$/.test(t)) throw bad('LRN', 'must be 12 digits'); return t; }
export function hhmm(v, name) { const t = str(v, { name, max: 5 }); if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw bad(name, 'must be HH:MM'); return t; }
export function ymd(v, name) { const t = str(v, { name, max: 10 }); if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) throw bad(name, 'must be YYYY-MM-DD'); return t; }
