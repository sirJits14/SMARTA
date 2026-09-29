import { useAsyncAction } from '../hooks/useAsyncAction.js';
import { ActionFeedback } from '../components/ui.jsx';
import { useMemo, useState } from 'react';
import { validateStudent, lrnTaken } from '../lib/validation.js';
import { saveStudentWithEnrollment } from '../data/students.js';
import { currentEnrollmentByStudent, planEnrollmentChange } from '../lib/enrollmentChange.js';
import { ENROLL_TYPE, GRADES, STUDENT_STATUS } from '../lib/constants.js';
import { T } from '../styles.js';
import { Modal, Field, Inp, Sel, Btn } from '../components/ui.jsx';

const DOC_FIELDS = [['form137', 'Form 137'], ['birthCert', 'Birth Certificate'], ['goodMoral', 'Good Moral'], ['form138', 'Form 138']];

export default function StudentForm({ students, editing, sections, enrollments, schoolYear, onClose }) {
  const action = useAsyncAction();
  const [f, setF] = useState(editing || { sex: '', documents: {} });
  const [errors, setErrors] = useState({});
  const currentEnrollment = useMemo(() => (
    editing ? currentEnrollmentByStudent(enrollments, schoolYear).get(editing.id) : null
  ), [editing, enrollments, schoolYear]);
  const sectionsSY = useMemo(() => sections
    .filter((section) => section.schoolYear === schoolYear)
    .sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name)), [sections, schoolYear]);
  const [grade, setGrade] = useState(() => currentEnrollment ? String(currentEnrollment.gradeLevel) : '');
  const [sectionId, setSectionId] = useState(() => currentEnrollment?.sectionId || '');
  const [enrollmentType, setEnrollmentType] = useState(ENROLL_TYPE[0]);
  const sectionsForGrade = useMemo(() => sectionsSY.filter((section) => String(section.gradeLevel) === grade), [grade, sectionsSY]);
  const gradeHasNoSections = !!grade && sectionsForGrade.length === 0;
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setDocFlag = (k, v) => setF((p) => ({ ...p, documents: { ...p.documents, [k]: v } }));
  const changeGrade = (value) => {
    setGrade(value);
    setSectionId('');
    setErrors((current) => ({ ...current, section: undefined }));
  };
  const changeSection = (value) => {
    setSectionId(value);
    setErrors((current) => ({ ...current, section: undefined }));
  };
  const save = async () => {
    const r = validateStudent(f);
    if (r.ok && lrnTaken(f.lrn, students, editing?.id)) { r.ok = false; r.errors.lrn = 'That LRN already belongs to another learner.'; }
    if (grade && !sectionId) { r.ok = false; r.errors.section = 'Choose a section for this grade.'; }
    if (!r.ok) { setErrors(r.errors); return; }
    const section = sectionsSY.find((candidate) => candidate.id === sectionId) || null;
    const enrollmentPlan = planEnrollmentChange({ current: currentEnrollment, section, schoolYear, type: enrollmentType });
    await action.run('save', async () => {
      await saveStudentWithEnrollment({ id: editing?.id, form: f, isNew: !editing, enrollmentPlan, schoolYear });
      onClose();
    });
  };
  return (
    <Modal labelledBy="learner-form-title" onClose={onClose} dismissible={!action.busy}>
      <ActionFeedback action={action}/>
      <h2 id="learner-form-title" style={{ fontFamily: T.display, color: T.ink, marginTop: 0, fontSize: 17, fontWeight: 600 }}>{editing ? 'Edit learner' : 'New learner'}</h2>
      <Field label="LRN" error={errors.lrn}><Inp style={T.num} value={f.lrn || ''} onChange={(e) => set('lrn', e.target.value)} maxLength={12} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: 'var(--sims-form-columns, 1fr 1fr)', gap: 10 }}>
        <Field label="Last name" error={errors.lastName}><Inp value={f.lastName || ''} onChange={(e) => set('lastName', e.target.value)} /></Field>
        <Field label="First name" error={errors.firstName}><Inp value={f.firstName || ''} onChange={(e) => set('firstName', e.target.value)} /></Field>
        <Field label="Middle name"><Inp value={f.middleName || ''} onChange={(e) => set('middleName', e.target.value)} /></Field>
        <Field label="Ext (Jr/III)"><Inp value={f.extName || ''} onChange={(e) => set('extName', e.target.value)} /></Field>
        <Field label="Sex" error={errors.sex}><Sel value={f.sex || ''} onChange={(e) => set('sex', e.target.value)}><option value="">—</option><option value="M">Male</option><option value="F">Female</option></Sel></Field>
        <Field label="Birthdate" error={errors.birthdate}><Inp type="date" value={f.birthdate || ''} onChange={(e) => set('birthdate', e.target.value)} /></Field>
      </div>
      <div style={{ fontFamily: T.body, fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.75, margin: '10px 0 6px' }}>Grade &amp; section (SY {schoolYear})</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'var(--sims-form-columns, 1fr 1fr)', gap: 10 }}>
        <Field label="Grade">
          <Sel value={grade} onChange={(e) => changeGrade(e.target.value)}>
            {!currentEnrollment && <option value="">— Not assigned —</option>}
            {GRADES.map((value) => <option key={value} value={value}>Grade {value}</option>)}
          </Sel>
        </Field>
        <Field label="Section" error={gradeHasNoSections ? undefined : errors.section}>
          <Sel value={sectionId} onChange={(e) => changeSection(e.target.value)} disabled={!grade || gradeHasNoSections}>
            {!currentEnrollment && <option value="">— Not assigned —</option>}
            {sectionsForGrade.map((section) => <option key={section.id} value={section.id}>{section.name}{section.strand ? ` · ${section.strand}` : ''}</option>)}
          </Sel>
          {gradeHasNoSections && <span style={{ display: 'block', color: T.inkMuted, fontSize: 12, marginTop: 4 }}>No Grade {grade} sections for SY {schoolYear}. Add one on the Sections tab.</span>}
        </Field>
      </div>
      {currentEnrollment ? (
        <p style={{ fontFamily: T.body, color: T.inkMuted, fontSize: 12, lineHeight: 1.5, margin: '-4px 0 14px' }}>Moving keeps the original enrollment date and type. Past attendance stays with the previous section.</p>
      ) : sectionId ? (
        <Field label="Enrollment type">
          <Sel value={enrollmentType} onChange={(e) => setEnrollmentType(e.target.value)}>
            {ENROLL_TYPE.map((type) => <option key={type} value={type}>{type}</option>)}
          </Sel>
        </Field>
      ) : null}
      <Field label="Address"><Inp value={f.address || ''} onChange={(e) => set('address', e.target.value)} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: 'var(--sims-form-columns, 1fr 1fr 1fr)', gap: 10 }}>
        <Field label="Guardian name"><Inp value={f.guardianName || ''} onChange={(e) => set('guardianName', e.target.value)} /></Field>
        <Field label="Guardian relationship"><Inp value={f.guardianRelationship || ''} onChange={(e) => set('guardianRelationship', e.target.value)} /></Field>
        <Field label="Guardian contact"><Inp style={T.num} value={f.guardianContact || ''} onChange={(e) => set('guardianContact', e.target.value)} /></Field>
      </div>
      <Field label="Contact number"><Inp style={T.num} value={f.contactNumber || ''} onChange={(e) => set('contactNumber', e.target.value)} /></Field>
      {editing && <Field label="Status"><Sel value={f.status || 'active'} onChange={(e) => set('status', e.target.value)}>{STUDENT_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}</Sel></Field>}
      <div style={{ fontFamily: T.body, fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.75, margin: '10px 0 6px' }}>Documents on file</div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        {DOC_FIELDS.map(([k, label]) => (
          <label key={k} style={{ fontFamily: T.body, fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={!!f.documents?.[k]} onChange={(e) => setDocFlag(k, e.target.checked)} />{label}
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn variant="ghost" disabled={action.busy} onClick={onClose}>Cancel</Btn>
        <Btn disabled={action.busy} onClick={save}>{editing ? 'Save changes' : 'Add learner'}</Btn>
      </div>
    </Modal>
  );
}
