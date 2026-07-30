import { collection, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase.js';
import { localDate } from '../lib/dates.js';
import { sectionKey } from '../lib/studentImport.js';
import { enrollmentId } from './enrollments.js';
import { DOCS_DEFAULT } from './students.js';

const BATCH_CHUNK_SIZE = 500; // Firestore's hard limit per writeBatch

export async function commitImportPlan({ plan, sections, schoolYear }) {
  const existingSectionByKey = new Map(
    sections
      .filter((s) => s.schoolYear === schoolYear)
      .map((s) => [sectionKey(s.gradeLevel, s.name), s])
  );
  const newSectionIdByKey = new Map();
  const writes = [];

  plan.newSections.forEach((sec) => {
    const ref = doc(collection(db, 'sections'));
    newSectionIdByKey.set(sec.key, ref.id);
    writes.push({
      ref,
      data: { name: sec.name, gradeLevel: sec.gradeLevel, track: null, strand: null, schoolYear, adviserName: '', scheduleId: null },
    });
  });

  const writableRows = plan.results.filter((r) => r.kind !== 'error');
  writableRows.forEach((row) => {
    const studentRef = row.existingStudentId
      ? doc(db, 'students', row.existingStudentId)
      : doc(collection(db, 'students'));
    const studentData = row.kind === 'new'
      ? { ...row.student, status: 'active', documents: { ...DOCS_DEFAULT }, createdAt: localDate() }
      : { ...row.student };
    writes.push({ ref: studentRef, data: studentData, merge: true });

    const existingSection = existingSectionByKey.get(row.sectionKey);
    const sectionId = existingSection ? existingSection.id : newSectionIdByKey.get(row.sectionKey);
    const enrollmentRef = doc(db, 'enrollments', enrollmentId(studentRef.id, schoolYear));
    writes.push({
      ref: enrollmentRef,
      data: {
        studentId: studentRef.id, schoolYear, gradeLevel: row.gradeLevel, sectionId,
        track: existingSection?.track || null, strand: existingSection?.strand || null,
        type: row.enrollType, dateEnrolled: localDate(), status: 'enrolled',
      },
    });
  });

  for (let i = 0; i < writes.length; i += BATCH_CHUNK_SIZE) {
    const batch = writeBatch(db);
    writes.slice(i, i + BATCH_CHUNK_SIZE).forEach(({ ref, data, merge }) =>
      batch.set(ref, data, merge ? { merge: true } : {})
    );
    await batch.commit();
  }

  return { studentsWritten: writableRows.length, sectionsCreated: plan.newSections.length };
}
