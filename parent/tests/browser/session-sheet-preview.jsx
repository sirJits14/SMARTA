import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../shared/theme/theme.css';
import '../../src/glass.css';
import '../../src/components/FamilySessionDetails.css';
import SessionSheet from '../../src/components/SessionSheet.jsx';
import SessionRows from '../../src/components/SessionRows.jsx';
import PageHeader from '../../src/components/PageHeader.jsx';
import Icon from '../../src/components/Icon.jsx';

const mark = (status, extra = {}) => ({ status, absent: status === 'A', overrideActive: false, reason: '', actorName: '', changedAt: null, ...extra });
const CASES = [
  { id: 'split', title: 'AM + PM day, PM corrected (notification)', requested: 'pm', data: {
    schedule: { timeIn: '07:30', timeOut: '12:00', pmTimeIn: '13:00', pmTimeOut: '16:30' },
    gate: { timeIn: '07:12', timeOut: '12:03', pmTimeIn: null, pmTimeOut: null },
    am: mark('P'), pm: mark('A', { overrideActive: true, reason: 'Left after lunch', actorName: 'Ms. Reyes', changedAt: '2026-10-18T06:10:00Z' }) } },
  { id: 'morning', title: 'Morning shift', data: {
    schedule: { timeIn: '06:00', timeOut: '12:00', pmTimeIn: null, pmTimeOut: null },
    gate: { timeIn: '06:21', timeOut: '12:01', pmTimeIn: null, pmTimeOut: null }, am: mark('L'), pm: mark('L') } },
  { id: 'afternoon', title: 'Afternoon shift', data: {
    schedule: { timeIn: '12:30', timeOut: '18:00', pmTimeIn: null, pmTimeOut: null },
    gate: { timeIn: '12:24', timeOut: '18:02', pmTimeIn: null, pmTimeOut: null }, am: mark('P'), pm: mark('P') } },
  { id: 'none', title: 'No schedule assigned', data: { schedule: null, gate: {}, am: mark('no_scan'), pm: mark('no_scan') } },
  { id: 'legacy', title: 'Old server (no schedule key)', data: { gate: {}, am: mark('P'), pm: mark('P') } },
];

function Case({ c }) {
  const [open, setOpen] = useState(false);
  return (
    <section data-case={c.id} style={{ padding: 16, borderBottom: '1px solid var(--t-border)' }}>
      <button type="button" onClick={() => setOpen(true)} style={{ minHeight: 44 }}>{c.title}</button>
      {open && <SessionSheet onClose={() => setOpen(false)}><SessionRows data={c.data} requestedSession={c.requested} /></SessionSheet>}
    </section>
  );
}

createRoot(document.getElementById('root')).render(<main style={{ maxWidth: 480, margin: '0 auto', position: 'relative' }}>
  <div style={{ position: 'relative', padding: '14px 16px 0' }}>
    <div aria-hidden="true" style={{ position: 'absolute', top: 14, right: 16, width: 44, height: 44, borderRadius: 999, border: '1px solid var(--t-glass-edge)' }} />
    <PageHeader title="Ella Marie Austral Dela Cruz" avatarName="Ella Marie Austral Dela Cruz" subtitle="Grade 7 – AMIABLE · Gate scans" status="No entry recorded today"
      onBack={() => {}} action={<button type="button" className="page-header-pill"><Icon name="calendar" size={18} />Sessions</button>} />
  </div>
  <aside style={{ padding: 12, textAlign: 'center', fontSize: 12 }}>Synthetic attendance · no Firebase access</aside>
  {CASES.map((c) => <Case key={c.id} c={c} />)}
</main>);
