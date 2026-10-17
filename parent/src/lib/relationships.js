import S from '../strings.js';

// Relationships offered when linking a learner. Must match RELATIONSHIPS and
// ADVISER in functions/src/handlers/codes.js and functions/src/lib/codeSlots.js.
export const RELATIONSHIPS = ['Mother', 'Father', 'Guardian', 'Grandparent', 'Sibling', 'Other'];
export const ADVISER = 'Adviser';

const DEPED_DOMAIN = '@deped.gov.ph';
// Display only: the server checks the verified token itself.
export const isDepedEmail = (email) => typeof email === 'string' && email.trim().toLowerCase().endsWith(DEPED_DOMAIN);

// A DepEd account may only cross the guardian/Adviser line (spec 2026-10-17):
// a guardian link can become Adviser, an Adviser link a guardian one. Links
// without a slot predate the adviser slot and are guardian links.
export const relationshipOptions = (slot) => (slot === 'adviser' ? RELATIONSHIPS : [ADVISER]);

// changeLinkRelationshipFn's refusals are written for the parent; anything
// else (network, internal) gets the generic message.
const SHOWN = ['permission-denied', 'invalid-argument', 'failed-precondition', 'resource-exhausted'];
export function changeErrorMessage(e) {
  const code = String(e?.code || '');
  return SHOWN.some((c) => code.endsWith(c)) && e?.message ? e.message : S.relChangeFailed;
}
