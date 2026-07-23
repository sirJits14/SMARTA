import { collection, addDoc, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { localDate } from '../lib/dates.js';

const DOCS_DEFAULT = { form137:false, birthCert:false, goodMoral:false, form138:false };

export const createStudent = (form) =>
  addDoc(collection(db, 'students'), {
    lrn:form.lrn, lastName:form.lastName.trim(), firstName:form.firstName.trim(),
    middleName:form.middleName?.trim()||'', extName:form.extName?.trim()||'',
    sex:form.sex, birthdate:form.birthdate, address:form.address?.trim()||'',
    guardianName:form.guardianName?.trim()||'', guardianRelationship:form.guardianRelationship?.trim()||'',
    guardianContact:form.guardianContact?.trim()||'', contactNumber:form.contactNumber?.trim()||'',
    status:'active', documents:{ ...DOCS_DEFAULT, ...(form.documents||{}) }, createdAt:localDate(),
  });

export const updateStudent = (id, form) =>
  setDoc(doc(db, 'students', id), {
    lrn:form.lrn, lastName:form.lastName.trim(), firstName:form.firstName.trim(),
    middleName:form.middleName?.trim()||'', extName:form.extName?.trim()||'',
    sex:form.sex, birthdate:form.birthdate, address:form.address?.trim()||'',
    guardianName:form.guardianName?.trim()||'', guardianRelationship:form.guardianRelationship?.trim()||'',
    guardianContact:form.guardianContact?.trim()||'', contactNumber:form.contactNumber?.trim()||'',
    status:form.status||'active', documents:{ ...DOCS_DEFAULT, ...(form.documents||{}) },
    createdAt:form.createdAt||localDate(),
  }, { merge:true });

export const deleteStudent = (id) => deleteDoc(doc(db, 'students', id));
