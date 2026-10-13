// endSchoolYear writes school_years/{sy} with endedAt. Once it exists, that
// year's slips can no longer be issued, reissued or redeemed, even though
// its enrollments stay 'enrolled'.
const SY = /^\d{4}-\d{4}$/;

// Null for a malformed year: endSchoolYear never marks one, so it is not ended.
export const schoolYearRef = (db, schoolYear) => (SY.test(schoolYear) ? db.doc(`school_years/${schoolYear}`) : null);
export const isEnded = (snap) => Boolean(snap?.exists && snap.data().endedAt);

export async function schoolYearEnded(db, schoolYear) {
  const ref = schoolYearRef(db, schoolYear);
  return ref ? isEnded(await ref.get()) : false;
}
