// The family relationships a link can hold; matches RELATIONSHIPS in
// functions/src/handlers/codes.js. School roles (Adviser) are assigned under
// Guardians > School access, never here.
export const FAMILY_RELATIONSHIPS = ['Mother', 'Father', 'Guardian', 'Grandparent', 'Sibling', 'Other'];

// The "changed from Mother" note for a link whose relationship changed this
// school year (spec 2026-10-17 §3): by the DepEd account itself, or
// "corrected" by an administrator. A link re-activated with next year's slip
// keeps last year's fields, so only the link's own school year counts.
export function relationshipChangeNote(link) {
  if (!link?.previousRelationship || link.relationshipChangedFor !== link.schoolYear) return null;
  return `${link.relationshipChangedBy ? 'corrected' : 'changed'} from ${link.previousRelationship}`;
}

// Only active family links can be corrected; adviser-slot links are school
// roles.
export function canCorrectRelationship(link) {
  return link?.status === 'active' && link.slot !== 'adviser' && link.relationship !== 'Adviser';
}

// The relationships an administrator can switch this link to.
export function correctionOptions(link) {
  return FAMILY_RELATIONSHIPS.filter((r) => r !== link?.relationship);
}
