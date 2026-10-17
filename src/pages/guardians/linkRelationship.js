// The "changed from Mother" note for a link a DepEd account corrected itself
// (spec 2026-10-17 §3). Only for the link's own school year: a link
// re-activated with next year's slip keeps last year's fields.
export function relationshipChangeNote(link) {
  if (!link?.previousRelationship || link.relationshipChangedFor !== link.schoolYear) return null;
  return `changed from ${link.previousRelationship}`;
}
