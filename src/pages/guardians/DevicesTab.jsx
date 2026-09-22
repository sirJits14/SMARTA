import { useState } from 'react';
import { useCollection } from '../../hooks/useCollection.js';
import { call } from '../../data/guardians.js';
import { T, S } from '../../styles.js';
import { Btn, Inp, Field, Card, Confirm } from '../../components/ui.jsx';

// Kiosk accounts are created by hand in Firebase Auth (console → Users →
// Add user, e.g. kiosk-gate1@bnhs.local + a generated 16+ char password);
// this tab allow-lists the resulting UID and labels the gate.
export default function DevicesTab() {
  const kiosks = useCollection('kiosks');
  const [uid, setUid] = useState(''); const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [confirm, setConfirm] = useState(null);

  const register = async () => {
    setBusy(true); setErr('');
    try { await call.registerKiosk({ uid: uid.trim(), label: label.trim() }); setUid(''); setLabel(''); }
    catch (e) { setErr(e.message || 'Could not register the device.'); }
    setBusy(false);
  };
  const deactivate = async (k) => { await call.deactivateKiosk({ uid: k.id, reason: 'Deactivated from SIMS' }); setConfirm(null); };

  return (
    <>
      <Card style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={S.h2}>Register a kiosk device</h2>
        <p style={{ fontFamily: T.body, fontSize: 13, color: T.inkMuted }}>Create the device's email/password user in Firebase Authentication first, then paste its UID here. Sign the device in at the kiosk's <code>/setup</code> page.</p>
        {err && <div style={{ color: T.absent, fontSize: 12, marginBottom: 8 }}>{err}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 12, alignItems: 'end' }}>
          <Field label="Auth UID"><Inp value={uid} onChange={(e) => setUid(e.target.value)} /></Field>
          <Field label="Gate label (shown to parents)"><Inp value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Main Gate" /></Field>
          <Btn onClick={register} disabled={busy || !uid || !label} style={{ marginBottom: 14 }}>Register</Btn>
        </div>
      </Card>
      <Card>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: T.body, fontSize: 13 }}>
          <thead style={S.thead}><tr><th style={S.th}>Label</th><th style={S.th}>UID</th><th style={S.th}>Status</th><th style={S.th}>Last seen</th><th style={S.th}></th></tr></thead>
          <tbody>
            {kiosks.map((k) => (
              <tr key={k.id}>
                <td style={S.td}>{k.label}</td><td style={{ ...S.td, ...T.num }}>{k.id}</td>
                <td style={S.td}>{k.active ? 'Active' : 'Deactivated'}</td>
                <td style={S.td}>{k.lastSeenAt?.toDate ? k.lastSeenAt.toDate().toLocaleString() : '—'}</td>
                <td style={S.td}>{k.active ? <Btn variant="ghost" onClick={() => setConfirm(k)}>Deactivate</Btn> : <Btn variant="ghost" onClick={() => call.registerKiosk({ uid: k.id, label: k.label })}>Re-activate</Btn>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {confirm && <Confirm message={`Deactivate "${confirm.label}"? The kiosk stops scanning within seconds.`} label="Deactivate" onYes={() => deactivate(confirm)} onNo={() => setConfirm(null)} />}
    </>
  );
}
