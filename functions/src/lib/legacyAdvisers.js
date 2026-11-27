// One row per legacy adviser account, so an administrator verifies each
// teacher once rather than once per learner. The suggestion is the most
// common current section among a small sample of that teacher's learners.
export const SAMPLE = 5;

function byTeacher(links) {
  const groups = new Map();
  for (const link of links) {
    if (!link?.guardianUid) continue;
    const group = groups.get(link.guardianUid) || { guardianUid: link.guardianUid, email: link.guardianEmail || '', name: link.guardianName || '', studentIds: [] };
    group.studentIds.push(link.studentId);
    groups.set(link.guardianUid, group);
  }
  return [...groups.values()];
}

export const sampleStudentIds = links => [...new Set(byTeacher(links).flatMap(g => g.studentIds.slice(0, SAMPLE)))];

export function groupLegacyAdvisers(links, sectionByStudent = {}) {
  return byTeacher(links).map(group => {
    const counts = new Map();
    for (const id of group.studentIds.slice(0, SAMPLE)) {
      const sectionId = sectionByStudent[id];
      if (sectionId) counts.set(sectionId, (counts.get(sectionId) || 0) + 1);
    }
    const suggestedSectionId = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || null;
    return { guardianUid: group.guardianUid, email: group.email, name: group.name, learnerCount: group.studentIds.length, suggestedSectionId };
  }).sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
}
