import { T } from '../styles.js';
import { Btn } from './ui.jsx';
const NAV = [
  { k: 'students', label: 'Students' },
  { k: 'sections', label: 'Sections' },
  { k: 'enroll', label: 'Enrollment' },
  { k: 'attendance', label: 'Attendance' },
];
export default function Shell({ me, page, setPage, schoolYear, onLogout, children }) {
  return (
    <div style={{ fontFamily: T.body, color: T.ink, minHeight: '100vh', background: T.walnut, display: 'grid', gridTemplateColumns: '210px 1fr', gridTemplateRows: '60px 1fr' }}>
      <div style={{ gridColumn: '1 / 3', background: T.walnut, borderBottom: `1px solid ${T.brassPlate}`, color: T.manila, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px' }}>
        <span style={{ fontFamily: T.display, fontSize: 17, fontWeight: 600, letterSpacing: '0.01em' }}>BNHS Learner Records</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ ...T.num, background: T.manila, color: T.ink, border: `1px solid ${T.brassDeep}`, borderRadius: T.radius, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>SY {schoolYear}</span>
          <span style={{ fontSize: 12, opacity: 0.75 }}>{me.name}</span>
          <Btn variant="ghost" onClick={onLogout} style={{ color: T.manila, borderColor: 'rgba(232,220,184,0.35)' }}>Sign out</Btn>
        </div>
      </div>
      <nav style={{ background: T.walnut, padding: '16px 10px' }}>
        {NAV.map((n) => {
          const active = page === n.k;
          return (
            <button key={n.k} onClick={() => setPage(n.k)} style={{
              fontFamily: T.body, display: 'block', width: '100%', textAlign: 'left', border: 'none',
              borderRadius: T.radius, padding: '11px 14px', marginBottom: 4, cursor: 'pointer',
              fontSize: 12, fontWeight: active ? 700 : 500, letterSpacing: '0.04em', textTransform: 'uppercase',
              background: active ? T.brassPlate : 'transparent',
              color: T.manila, opacity: active ? 1 : 0.68,
              transform: active ? 'translateX(6px)' : 'translateX(0)',
              boxShadow: active ? '0 2px 6px rgba(0,0,0,0.3)' : 'none',
              transition: 'transform 0.15s ease-out, background 0.15s ease-out, opacity 0.15s ease-out',
            }}>{n.label}</button>
          );
        })}
      </nav>
      <main style={{ padding: 28, overflow: 'auto' }}>{children}</main>
    </div>
  );
}
