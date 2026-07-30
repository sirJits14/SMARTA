import { useMemo, useState } from 'react';
import { useCollection } from '../hooks/useCollection.js';
import { createSchedule, updateSchedule, deleteSchedule } from '../data/schedules.js';
import { T, S } from '../styles.js';
import { Btn, Inp, Field, Modal, Card, Confirm, EmptyState } from '../components/ui.jsx';

function ScheduleForm({ editing, onClose }) {
  const [f, setF] = useState(editing || { name: '', timeIn: '', timeOut: '' });
  const [err, setErr] = useState('');
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    if (!f.name?.trim()) { setErr('Schedule name is required.'); return; }
    if (!f.timeIn || !f.timeOut) { setErr('Time in and time out are required.'); return; }
    if (f.timeOut <= f.timeIn) { setErr('Time out must be later than time in.'); return; }
    editing ? await updateSchedule(editing.id, f) : await createSchedule(f);
    onClose();
  };
  return (
    <Modal onClose={onClose}>
      <h2 style={{ fontFamily: T.display, color: T.ink, marginTop: 0, fontSize: 17, fontWeight: 600 }}>{editing ? 'Edit schedule' : 'New schedule'}</h2>
      {err && <div style={{ fontFamily: T.body, background: 'rgba(139,58,47,0.12)', color: T.absent, borderRadius: T.radius, padding: '8px 10px', fontSize: 12, marginBottom: 12 }}>{err}</div>}
      <Field label="Schedule name"><Inp value={f.name || ''} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Morning Shift" /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Time in"><Inp type="time" value={f.timeIn || ''} onChange={(e) => set('timeIn', e.target.value)} /></Field>
        <Field label="Time out"><Inp type="time" value={f.timeOut || ''} onChange={(e) => set('timeOut', e.target.value)} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save}>{editing ? 'Save changes' : 'Add schedule'}</Btn>
      </div>
    </Modal>
  );
}

const sectionLabel = (s) => `${s.name} (Grade ${s.gradeLevel}, SY ${s.schoolYear})`;

export default function SchedulesPage() {
  const schedules = useCollection('schedules');
  const sections = useCollection('sections');
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [blocked, setBlocked] = useState(null);

  const rows = useMemo(() => [...schedules].sort((a, b) => a.name.localeCompare(b.name)), [schedules]);

  const requestDelete = (schedule) => {
    const inUse = sections.filter((s) => s.scheduleId === schedule.id);
    if (inUse.length > 0) { setBlocked({ schedule, inUse }); return; }
    setConfirm(schedule);
  };

  return (
    <div>
      <div style={S.plate}>
        <h1 style={S.h1}>Schedules</h1>
        <Btn onClick={() => setForm({})}>Add schedule</Btn>
      </div>
      {rows.length === 0 ? (
        <Card style={{ padding: 20 }}>
          <EmptyState title="No schedules yet" hint="Add your first shift schedule with the button above." />
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={S.thead}>
              {['Name', 'Time In', 'Time Out', ''].map((h) => <th key={h} style={S.th}>{h}</th>)}
            </tr></thead>
            <tbody>{rows.map((s) => (
              <tr key={s.id}>
                <td style={{ ...S.td, fontWeight: 600 }}>{s.name}</td>
                <td style={{ ...S.td, ...T.num }}>{s.timeIn}</td>
                <td style={{ ...S.td, ...T.num }}>{s.timeOut}</td>
                <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <Btn variant="ghost" onClick={() => setForm(s)} style={{ marginRight: 6 }}>Edit</Btn>
                  <Btn variant="ghost" onClick={() => requestDelete(s)} style={{ color: T.absent, borderColor: T.absent }}>Delete</Btn>
                </td>
              </tr>))}
            </tbody>
          </table>
        </Card>
      )}
      {form && <ScheduleForm editing={form.id ? form : null} onClose={() => setForm(null)} />}
      {confirm && <Confirm message={`Delete ${confirm.name}? This cannot be undone.`} onYes={async () => { await deleteSchedule(confirm.id); setConfirm(null); }} onNo={() => setConfirm(null)} />}
      {blocked && (
        <Modal onClose={() => setBlocked(null)}>
          <h2 style={{ fontFamily: T.display, color: T.ink, marginTop: 0, fontSize: 17, fontWeight: 600 }}>Can't delete "{blocked.schedule.name}"</h2>
          <p style={{ fontFamily: T.body, color: T.ink, fontSize: 13 }}>
            This schedule is still assigned to {blocked.inUse.length} section{blocked.inUse.length === 1 ? '' : 's'}:
          </p>
          <ul style={{ fontFamily: T.body, fontSize: 13, color: T.ink, paddingLeft: 20, margin: '0 0 16px' }}>
            {blocked.inUse.map((s) => <li key={s.id}>{sectionLabel(s)}</li>)}
          </ul>
          <p style={{ fontFamily: T.body, color: T.inkMuted, fontSize: 12 }}>Reassign or clear the schedule on these sections first.</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Btn onClick={() => setBlocked(null)}>Got it</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
