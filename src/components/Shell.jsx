import { T } from '../styles.js';
import { Btn } from './ui.jsx';
import bnhsLogo from '../assets/bnhs_logo.png';
const NAV = [
  { k: 'dashboard', label: 'Dashboard' },
  { k: 'students', label: 'Students' },
  { k: 'sections', label: 'Sections' },
  { k: 'schedules', label: 'Schedules' },
  { k: 'enroll', label: 'Enrollment' },
  { k: 'attendance', label: 'Attendance' },
  { k: 'idcards', label: 'ID Cards' },
  { k: 'settings', label: 'Settings' },
];
export default function Shell({ me, page, setPage, schoolYear, onLogout, children }) {
  return (
    <>
      <style>{`body { margin: 0; }`}</style>
      <div className="app-shell" style={{ fontFamily: T.body, color: T.ink, height: '100vh', overflow: 'hidden', background: T.bg, display: 'grid', gridTemplateColumns: '220px 1fr' }}>
      <aside className="app-sidebar" style={{ background: T.surface, borderRight: `1px solid ${T.border}`, padding: '24px 16px', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28, padding: '0 8px' }}>
          <img src={bnhsLogo} alt="Bukidnon National High School seal" width={32} height={32} style={{ flexShrink: 0 }} />
          <span style={{ fontFamily: T.display, fontSize: 15, fontWeight: 700, color: T.ink }}>BNHS SIMS</span>
        </div>
        <nav style={{ flex: 1 }}>
          {NAV.map((n) => {
            const active = page === n.k;
            return (
              <button key={n.k} onClick={() => setPage(n.k)} style={{
                fontFamily: T.body, display: 'block', width: '100%', textAlign: 'left', border: 'none',
                borderRadius: T.pill, padding: '10px 16px', marginBottom: 4, cursor: 'pointer',
                fontSize: 13, fontWeight: active ? 700 : 500,
                background: active ? T.primary : 'transparent',
                color: active ? '#fff' : T.inkMuted,
                transition: 'background 0.15s ease-out, color 0.15s ease-out',
              }}>{n.label}</button>
            );
          })}
        </nav>
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16, marginTop: 16 }}>
          <div style={{ fontFamily: T.body, fontSize: 13, fontWeight: 600, color: T.ink, marginBottom: 2 }}>{me.name}</div>
          <div style={{ fontFamily: T.body, fontSize: 11, color: T.inkMuted, marginBottom: 10 }}>Registrar</div>
          <Btn variant="ghost" onClick={onLogout} style={{ width: '100%' }}>Sign out</Btn>
        </div>
      </aside>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="app-topbar" style={{ height: 60, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 28px', background: T.surface, flexShrink: 0 }}>
          <span style={{ ...T.num, background: 'rgba(91,79,232,0.08)', color: T.primary, borderRadius: T.pill, padding: '4px 12px', fontSize: 12, fontWeight: 700 }}>SY {schoolYear}</span>
        </div>
        <main style={{ padding: 28, overflow: 'auto', flex: 1 }}>{children}</main>
      </div>
      </div>
    </>
  );
}
