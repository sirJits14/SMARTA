import { useState } from 'react';
import { useCollection } from '../../hooks/useCollection.js';
import { call } from '../../data/guardians.js';
import { T, S } from '../../styles.js';
import { Btn, Inp, Field, Card, Confirm, Modal } from '../../components/ui.jsx';

const copyToClipboard = async (text) => {
  try { await navigator.clipboard.writeText(text); }
  catch { /* clipboard unavailable (e.g. insecure context) -- the value is still visible to select and copy by hand */ }
};

// Kiosk accounts are created here, not by hand in Firebase Auth: provisionKiosk
// (functions/src/handlers/kiosks.js) creates the Auth user AND the kiosks/{uid}
// allow-list doc in one call, so staff never needs a Firebase Auth UID.
export default function DevicesTab() {
  const kiosks = useCollection('kiosks');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [confirmReset, setConfirmReset] = useState(null);
  const [credentials, setCredentials] = useState(null); // { label, email, password } | null

  const create = async () => {
    setBusy(true); setErr('');
    try {
      const { email, password } = await call.provisionKiosk({ label: label.trim() });
      setCredentials({ label: label.trim(), email, password });
      setLabel('');
    } catch (e) { setErr(e.message || 'Could not create the device.'); }
    setBusy(false);
  };
  const resetPassword = async (k) => {
    setErr('');
    try {
      const { email, password } = await call.resetKioskPassword({ uid: k.id });
      setCredentials({ label: k.label, email, password });
    } catch (e) { setErr(e.message || 'Could not reset the password.'); }
  };
  const deactivate = async (k) => { await call.deactivateKiosk({ uid: k.id, reason: 'Deactivated from SIMS' }); setConfirm(null); };

  return (
    <>
      <Card style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={S.h2}>Add a new kiosk device</h2>
        <p style={{ fontFamily: T.body, fontSize: 13, color: T.inkMuted }}>Name the gate. SIMS creates the device's sign-in and shows it to you once — copy it into that computer's <code>/setup</code> page.</p>
        {err && <div style={{ color: T.absent, fontSize: 12, marginBottom: 8 }}>{err}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
          <Field label="Gate label (shown to parents)"><Inp value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Main Gate" /></Field>
          <Btn onClick={create} disabled={busy || !label.trim()} style={{ marginBottom: 14 }}>{busy ? 'Creating…' : 'Create device'}</Btn>
        </div>
      </Card>
      <Card>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: T.body, fontSize: 13 }}>
          <thead style={S.thead}><tr><th style={S.th}>Label</th><th style={S.th}>Status</th><th style={S.th}>Last seen</th><th style={S.th}></th></tr></thead>
          <tbody>
            {kiosks.map((k) => (
              <tr key={k.id}>
                <td style={S.td}>{k.label}</td>
                <td style={S.td}>{k.active ? 'Active' : 'Deactivated'}</td>
                <td style={S.td}>{k.lastSeenAt?.toDate ? k.lastSeenAt.toDate().toLocaleString() : '—'}</td>
                <td style={{ ...S.td, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  {k.active
                    ? <>
                        <Btn variant="ghost" onClick={() => setConfirmReset(k)}>Reset password</Btn>
                        <Btn variant="ghost" onClick={() => setConfirm(k)}>Deactivate</Btn>
                      </>
                    : <Btn variant="ghost" onClick={() => call.registerKiosk({ uid: k.id, label: k.label })}>Re-activate</Btn>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {confirm && <Confirm message={`Deactivate "${confirm.label}"? The kiosk stops scanning within seconds.`} label="Deactivate" onYes={() => deactivate(confirm)} onNo={() => setConfirm(null)} />}
      {confirmReset && (
        <Confirm
          message={`Reset the password for "${confirmReset.label}"? The device will be signed out within the hour and must be signed in again at /setup with the new password.`}
          label="Reset password"
          danger={false}
          onYes={() => { const k = confirmReset; setConfirmReset(null); resetPassword(k); }}
          onNo={() => setConfirmReset(null)}
        />
      )}
      {credentials && (
        <Modal onClose={() => {}}>
          <h2 style={S.h2}>{credentials.label} is ready</h2>
          <p style={{ fontFamily: T.body, fontSize: 13, color: T.inkMuted }}>Copy these into that computer's <code>/setup</code> page now — the password won't be shown again.</p>
          <Field label="Device email">
            <div style={{ display: 'flex', gap: 8 }}>
              <Inp readOnly value={credentials.email} onFocus={(e) => e.target.select()} />
              <Btn variant="ghost" onClick={() => copyToClipboard(credentials.email)}>Copy</Btn>
            </div>
          </Field>
          <Field label="Password">
            <div style={{ display: 'flex', gap: 8 }}>
              <Inp readOnly value={credentials.password} onFocus={(e) => e.target.select()} style={{ ...T.num }} />
              <Btn variant="ghost" onClick={() => copyToClipboard(credentials.password)}>Copy</Btn>
            </div>
          </Field>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Btn onClick={() => setCredentials(null)}>Done</Btn>
          </div>
        </Modal>
      )}
    </>
  );
}
