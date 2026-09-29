import { collection, addDoc, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase.js';
import { localDate } from '../lib/dates.js';
import { enrollmentId } from './enrollments.js';

export const DOCS_DEFAULT = { form137:false, birthCert:false, goodMoral:false, form138:false };

const studentShape = (form) => ({
    lrn:form.lrn, lastName:form.lastName.trim(), firstName:form.firstName.trim(),
    middleName:form.middleName?.trim()||'', extName:form.extName?.trim()||'',
    sex:form.sex, birthdate:form.birthdate, address:form.address?.trim()||'',
    guardianName:form.guardianName?.trim()||'', guardianRelationship:form.guardianRelationship?.trim()||'',
    guardianContact:form.guardianContact?.trim()||'', contactNumber:form.contactNumber?.trim()||'',
    status:form.status||'active', documents:{ ...DOCS_DEFAULT, ...(form.documents||{}) },
    createdAt:form.createdAt||localDate(),
  });

export const createStudent = (form) =>
  addDoc(collection(db, 'students'), studentShape({ ...form, status:'active', createdAt:localDate() }));

export const updateStudent = (id, form) =>
  setDoc(doc(db, 'students', id), studentShape(form), { merge:true });

export async function saveStudentWithEnrollment({ id, form, isNew, enrollmentPlan, schoolYear }) {
  const batch = writeBatch(db);
  const studentRef = isNew ? doc(collection(db, 'students')) : doc(db, 'students', id);
  const studentId = studentRef.id;
  const shaped = isNew
    ? studentShape({ ...form, status:'active', createdAt:localDate() })
    : studentShape(form);

  if (isNew) batch.set(studentRef, shaped);
  else batch.set(studentRef, shaped, { merge:true });

  if (enrollmentPlan.kind !== 'none') {
    const enrollmentRef = doc(db, 'enrollments', enrollmentId(studentId, schoolYear));
    if (enrollmentPlan.kind === 'transfer') {
      batch.set(enrollmentRef, enrollmentPlan.data, { merge:true });
    } else {
      batch.set(enrollmentRef, { ...enrollmentPlan.data, studentId });
    }
  }

  await batch.commit();
  return studentId;
}

export const deleteStudent = (id) => deleteDoc(doc(db, 'students', id));
