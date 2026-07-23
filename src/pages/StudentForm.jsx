import { useState } from 'react';
import { validateStudent, lrnTaken } from '../lib/validation.js';
import { createStudent, updateStudent } from '../data/students.js';
import { STUDENT_STATUS } from '../lib/constants.js';
import { T } from '../styles.js';
import { Modal, Field, Inp, Sel, Btn } from '../components/ui.jsx';

const DOC_FIELDS = [['form137','Form 137'],['birthCert','Birth Certificate'],['goodMoral','Good Moral'],['form138','Form 138']];

export default function StudentForm({ students, editing, onClose }) {
  const [f, setF] = useState(editing || { sex:'', documents:{} });
  const [errors, setErrors] = useState({});
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setDoc = (k, v) => setF((p) => ({ ...p, documents:{ ...p.documents, [k]: v } }));
  const save = async () => {
    const r = validateStudent(f);
    if (r.ok && lrnTaken(f.lrn, students, editing?.id)) { r.ok = false; r.errors.lrn = 'That LRN already belongs to another learner.'; }
    if (!r.ok) { setErrors(r.errors); return; }
    editing ? await updateStudent(editing.id, f) : await createStudent(f);
    onClose();
  };
  return (
    <Modal onClose={onClose}>
      <h2 style={{ fontFamily:T.display, color:T.ink, marginTop:0 }}>{editing ? 'Edit learner' : 'New learner'}</h2>
      <Field label="LRN" error={errors.lrn}><Inp style={T.num} value={f.lrn||''} onChange={(e)=>set('lrn', e.target.value)} maxLength={12} /></Field>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <Field label="Last name" error={errors.lastName}><Inp value={f.lastName||''} onChange={(e)=>set('lastName', e.target.value)} /></Field>
        <Field label="First name" error={errors.firstName}><Inp value={f.firstName||''} onChange={(e)=>set('firstName', e.target.value)} /></Field>
        <Field label="Middle name"><Inp value={f.middleName||''} onChange={(e)=>set('middleName', e.target.value)} /></Field>
        <Field label="Ext (Jr/III)"><Inp value={f.extName||''} onChange={(e)=>set('extName', e.target.value)} /></Field>
        <Field label="Sex" error={errors.sex}><Sel value={f.sex||''} onChange={(e)=>set('sex', e.target.value)}><option value="">—</option><option value="M">Male</option><option value="F">Female</option></Sel></Field>
        <Field label="Birthdate" error={errors.birthdate}><Inp type="date" value={f.birthdate||''} onChange={(e)=>set('birthdate', e.target.value)} /></Field>
      </div>
      <Field label="Address"><Inp value={f.address||''} onChange={(e)=>set('address', e.target.value)} /></Field>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <Field label="Guardian name"><Inp value={f.guardianName||''} onChange={(e)=>set('guardianName', e.target.value)} /></Field>
        <Field label="Guardian contact"><Inp style={T.num} value={f.guardianContact||''} onChange={(e)=>set('guardianContact', e.target.value)} /></Field>
      </div>
      {editing && <Field label="Status"><Sel value={f.status||'active'} onChange={(e)=>set('status', e.target.value)}>{STUDENT_STATUS.map((s)=><option key={s} value={s}>{s}</option>)}</Sel></Field>}
      <div style={{ fontSize:12, fontWeight:600, margin:'8px 0 4px' }}>Documents on file</div>
      <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginBottom:14 }}>
        {DOC_FIELDS.map(([k,label]) => (
          <label key={k} style={{ fontSize:12, display:'flex', gap:5, alignItems:'center' }}>
            <input type="checkbox" checked={!!f.documents?.[k]} onChange={(e)=>setDoc(k, e.target.checked)} />{label}
          </label>
        ))}
      </div>
      <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save}>{editing ? 'Save changes' : 'Add learner'}</Btn>
      </div>
    </Modal>
  );
}
