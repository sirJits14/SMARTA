import { useState } from 'react';
import { T, S } from '../styles.js';
import DevicesTab from './guardians/DevicesTab.jsx';
import PortalSettingsTab from './guardians/PortalSettingsTab.jsx';

// TODO(Tasks 18-19): restore the full eight-tab set — codes, requests,
// reports, links, scanlog, audit — once those tabs exist. Until then this
// page only wires the two tabs this task builds so the app keeps building.
const TABS = [
  ['devices', 'Kiosk devices'], ['settings', 'Portal settings'],
];

export default function GuardiansPage({ schoolYear, me }) {
  const [tab, setTab] = useState('devices');
  return (
    <div>
      <div style={S.plate}><h1 style={S.h1}>Guardians</h1></div>
      <div role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
        {TABS.map(([k, label]) => {
          const active = tab === k;
          return <button key={k} role="tab" aria-selected={active} onClick={() => setTab(k)} style={{ fontFamily: T.body, fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', cursor: 'pointer', padding: '9px 16px', borderRadius: T.pill, border: 'none', background: active ? T.primary : 'transparent', color: active ? '#fff' : T.inkMuted }}>{label}</button>;
        })}
      </div>
      {tab === 'devices' && <DevicesTab />}
      {tab === 'settings' && <PortalSettingsTab me={me} />}
    </div>
  );
}
