import { useState } from 'react';
import { T, S } from '../styles.js';
import DevicesTab from './guardians/DevicesTab.jsx';
import CodesTab from './guardians/CodesTab.jsx';
import RequestsTab from './guardians/RequestsTab.jsx';
import ReportsTab from './guardians/ReportsTab.jsx';
import LinksTab from './guardians/LinksTab.jsx';
import ScanLogTab from './guardians/ScanLogTab.jsx';
import AuditTab from './guardians/AuditTab.jsx';
import PortalSettingsTab from './guardians/PortalSettingsTab.jsx';

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
      {tab === 'codes' && <CodesTab schoolYear={schoolYear} />}
      {tab === 'requests' && <RequestsTab schoolYear={schoolYear} />}
      {tab === 'reports' && <ReportsTab />}
      {tab === 'links' && <LinksTab schoolYear={schoolYear} />}
      {tab === 'devices' && <DevicesTab />}
      {tab === 'scanlog' && <ScanLogTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'settings' && <PortalSettingsTab me={me} />}
    </div>
  );
}
