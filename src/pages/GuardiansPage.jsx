import { useState, lazy, Suspense } from 'react';
import { T, S } from '../styles.js';
import loadingGif from '../assets/loading.gif';

// Same reasoning as App.jsx's page split, one level down: each tab (and, for
// CodesTab, the qrcode-based activation-slip printing it pulls in) loads
// only once actually selected, not all eight up front.
const DevicesTab = lazy(() => import('./guardians/DevicesTab.jsx'));
const CodesTab = lazy(() => import('./guardians/CodesTab.jsx'));
const RequestsTab = lazy(() => import('./guardians/RequestsTab.jsx'));
const ReportsTab = lazy(() => import('./guardians/ReportsTab.jsx'));
const LinksTab = lazy(() => import('./guardians/LinksTab.jsx'));
const ScanLogTab = lazy(() => import('./guardians/ScanLogTab.jsx'));
const AuditTab = lazy(() => import('./guardians/AuditTab.jsx'));
const PortalSettingsTab = lazy(() => import('./guardians/PortalSettingsTab.jsx'));

const TabFallback = () => (
  <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}>
    <img src={loadingGif} alt="Loading" width={56} height={56} />
  </div>
);

const TABS = [
  ['codes', 'Activation slips'], ['requests', 'Access requests'], ['reports', 'Reports'], ['links', 'Learner access'],
  ['devices', 'Kiosk devices'], ['scanlog', 'Scan log'], ['audit', 'Audit log'], ['settings', 'Portal settings'],
];

export default function GuardiansPage({ schoolYear, me }) {
  const [tab, setTab] = useState('codes');
  return (
    <div>
      <div className="guardians-heading" style={S.plate}><h1 style={S.h1}>Guardians</h1></div>
      <div className="guardians-tabs" role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
        {TABS.map(([k, label]) => {
          const active = tab === k;
          return <button key={k} role="tab" aria-selected={active} onClick={() => setTab(k)} style={{ fontFamily: T.body, fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', cursor: 'pointer', padding: '9px 16px', borderRadius: T.pill, border: 'none', background: active ? T.primary : 'transparent', color: active ? '#fff' : T.inkMuted }}>{label}</button>;
        })}
      </div>
      <Suspense fallback={<TabFallback />}>
        {tab === 'codes' && <CodesTab schoolYear={schoolYear} />}
        {tab === 'requests' && <RequestsTab schoolYear={schoolYear} />}
        {tab === 'reports' && <ReportsTab />}
        {tab === 'links' && <LinksTab schoolYear={schoolYear} />}
        {tab === 'devices' && <DevicesTab />}
        {tab === 'scanlog' && <ScanLogTab />}
        {tab === 'audit' && <AuditTab />}
        {tab === 'settings' && <PortalSettingsTab me={me} />}
      </Suspense>
    </div>
  );
}
