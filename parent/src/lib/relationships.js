import S from '../strings.js';

// Relationships offered when linking a learner. Must match RELATIONSHIPS and
// ADVISER in functions/src/handlers/codes.js and functions/src/lib/codeSlots.js.
export const RELATIONSHIPS = ['Mother', 'Father', 'Guardian', 'Grandparent', 'Sibling', 'Other'];
export const ADVISER = 'Adviser';

const DEPED_DOMAIN = '@deped.gov.ph';
// Display only: the server checks the verified token itself.
export const isDepedEmail = (email) => typeof email === 'string' && email.trim().toLowerCase().endsWith(DEPED_DOMAIN);

// A DepEd account can move its own family link to another family
// relationship or to Adviser (which ends its family access). Adviser links
// are never offered a change (changeLinkRelationship in
// functions/src/handlers/links.js).
export const relationshipOptions = (link) => [...RELATIONSHIPS.filter((r) => r !== link?.relationship), ADVISER];

// changeLinkRelationshipFn's refusals are written for the parent; anything
// else (network, internal) gets the generic message.
const SHOWN = ['permission-denied', 'invalid-argument', 'failed-precondition', 'resource-exhausted'];
export function changeErrorMessage(e) {
  const code = String(e?.code || '');
  return SHOWN.some((c) => code.endsWith(c)) && e?.message ? e.message : S.relChangeFailed;
}
