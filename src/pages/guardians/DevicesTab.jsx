import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { ActionFeedback } from '../../components/ui.jsx';
import { ResourceState } from '../../components/ui.jsx';
import { useEffect, useState } from 'react';
import { useCollectionResource } from '../../hooks/useCollection.js';
import { call } from '../../data/guardians.js';
import { T, S } from '../../styles.js';
import { Btn, Inp, Field, Card, Confirm, Modal } from '../../components/ui.jsx';
import { kioskPresence, modeChangeNote, visibleKiosks, PRESENCE_TICK_MS } from '../../lib/kioskPresence.js';

const copyToClipboard = async (text) => {
  try { await navigator.clipboard.writeText(text); }
  catch { /* clipboard unavailable (e.g. insecure context) -- the value is still visible to select and copy by hand */ }
};

const MODES = [['entrance', 'Entrance'], ['exit', 'Exit']];
const MODE_LABEL = Object.fromEntries(MODES);
const DOT = { online: T.present, offline: T.inkMuted, deactivated: 'transparent' };

// Re-renders on a timer so a kiosk that stops heartbeating turns Offline
// without a reload.
function useNow(intervalMs) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function StatusCell({ kiosk, now }) {
  const p = kioskPresence(kiosk, now);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', color: p.state === 'online' ? T.present : T.inkMuted }}>
      {p.state !== 'deactivated' && <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: DOT[p.state] }} />}
      {p.label}
    </span>
  );
}

function ModeCell({ kiosk, busy, onChange }) {
  if (kiosk.active !== true) return <span style={{ color: T.inkMuted }}>—</span>;
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div role="group" aria-label={`Scan mode for ${kiosk.label}`} style={{ display: 'inline-flex', gap: 4 }}>
        {MODES.map(([value, label]) => (
          <Btn key={value} variant={kiosk.mode === value ? 'solid' : 'ghost'} aria-pressed={kiosk.mode === value}
            aria-disabled={kiosk.mode === value ? 'true' : undefined}
            disabled={busy} onClick={() => { if (kiosk.mode !== value) onChange(value); }}>{label}</Btn>
        ))}
      </div>
      <span style={{ fontSize: 11, color: T.inkMuted }}>{modeChangeNote(kiosk)}</span>
    </div>
  );
}

// Kiosk accounts are created here, not by hand in Firebase Auth: provisionKiosk
// (functions/src/handlers/kiosks.js) creates the Auth user AND the kiosks/{uid}
// allow-list doc in one call, so staff never needs a Firebase Auth UID.
export default function DevicesTab() {
  const action = useAsyncAction();
  const kiosksResource = useCollectionResource('kiosks');
  const kiosks = visibleKiosks(kiosksResource.data || []);
  const activeKiosks = kiosks.filter((k) => k.active === true);
  const now = useNow(PRESENCE_TICK_MS);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [confirmReset, setConfirmReset] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmAll, setConfirmAll] = useState(null); // 'entrance' | 'exit' | null
  const [bulkNote, setBulkNote] = useState(''); // result of the last Set-all
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
    } catch (e) { setErr(e.message || 'Could not reset the password.'); throw e; }
  };
  const deactivate = async (k) => { await call.deactivateKiosk({ uid: k.id, reason: 'Deactivated from SIMS' }); setConfirm(null); };
  const remove = async (k) => { await call.deleteKiosk({ uid: k.id }); setConfirmDelete(null); };
  const setMode = (uids, mode) => action.run('mode', () => call.setKioskMode({ uids, mode }));
  const setAll = async (mode) => {
    if (activeKiosks.length === 0) { setConfirmAll(null); return; }
    // action.run swallows errors into ActionFeedback; rethrow so Confirm keeps
    // the dialog open and shows its own error.
    setBulkNote('');
    const result = await action.run('mode', () => call.setKioskMode({ uids: activeKiosks.map((k) => k.id), mode }));
    if (!result.ok) throw result.error || new Error('Another kiosk change is still in progress.');
    const { updated, skipped } = result.value || {};
    const n = Array.isArray(updated) ? updated.length : activeKiosks.length;
    const skip = Array.isArray(skipped) ? skipped.length : 0;
    setBulkNote(`Switched ${n} kiosk${n === 1 ? '' : 's'} to ${MODE_LABEL[mode]}${skip ? `, skipped ${skip} that ${skip === 1 ? 'was' : 'were'} no longer active` : ''}.`);
    setConfirmAll(null);
  };

  if ([kiosksResource].some(r => r.loading || r.error)) return <ResourceState resources={[kiosksResource]}/>;

  return (
    <>
      <ActionFeedback action={action}/>
      <Card style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={S.h2}>Add a new kiosk device</h2>
        <p style={{ fontFamily: T.body, fontSize: 13, color: T.inkMuted }}>Name the gate. SIMS creates the device's sign-in and shows it to you once — copy it into that computer's <code>/setup</code> page.</p>
        {err && <div style={{ color: T.absent, fontSize: 12, marginBottom: 8 }}>{err}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'var(--sims-form-columns, 1fr auto)', gap: 12, alignItems: 'end' }}>
          <Field label="Gate label (shown to parents)"><Inp value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Main Gate" /></Field>
          <Btn onClick={() => action.run('create', create)} disabled={action.busy || busy || !label.trim()} style={{ marginBottom: 14 }}>{busy ? 'Creating…' : 'Create device'}</Btn>
        </div>
      </Card>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <p style={{ fontFamily: T.body, fontSize: 12, color: T.inkMuted, margin: 0 }}>
          Online means the kiosk page is open and connected. Entrance/Exit can also be changed on the kiosk itself; the latest change wins.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, minWidth: 0 }}>
          {MODES.map(([value, text]) => (
            <Btn key={value} variant="ghost" disabled={action.busy || activeKiosks.length === 0} onClick={() => setConfirmAll(value)}>
              Set all active kiosks to {text}
            </Btn>
          ))}
        </div>
      </div>
      {bulkNote && <p role="status" style={{ fontFamily: T.body, fontSize: 12, color: T.inkMuted, margin: '0 0 12px' }}>{bulkNote}</p>}
      <Card>
        <div className="sims-table-scroll" role="region" aria-label="Records" tabIndex={0}><table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: T.body, fontSize: 13 }}>
          <thead style={S.thead}><tr><th style={S.th}>Label</th><th style={S.th}>Status</th><th style={S.th}>Mode</th><th style={S.th}>Last seen</th><th style={S.th}></th></tr></thead>
          <tbody>
            {kiosks.map((k) => (
              <tr key={k.id}>
                <td style={S.td}>{k.label}</td>
                <td style={S.td}><StatusCell kiosk={k} now={now} /></td>
                <td style={S.td}><ModeCell kiosk={k} busy={action.busy} onChange={(mode) => setMode([k.id], mode)} /></td>
                <td style={S.td}>{k.lastSeenAt?.toDate ? k.lastSeenAt.toDate().toLocaleString() : '—'}</td>
                <td style={S.td}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
                    {k.active
                      ? <>
                          <Btn variant="ghost" onClick={() => setConfirmReset(k)}>Reset password</Btn>
                          <Btn variant="ghost" onClick={() => setConfirm(k)}>Deactivate</Btn>
                        </>
                      : <Btn variant="ghost" onClick={() => action.run('action', () => call.registerKiosk({ uid: k.id, label: k.label }))}>Re-activate</Btn>}
                    <Btn variant="ghost-danger" onClick={() => setConfirmDelete(k)}>Delete</Btn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Card>
      {confirm && <Confirm message={`Deactivate "${confirm.label}"? The kiosk stops scanning within seconds.`} label="Deactivate" onYes={() => deactivate(confirm)} onNo={() => setConfirm(null)} />}
      {confirmDelete && (
        <Confirm
          title="Delete kiosk"
          message={`Delete "${confirmDelete.label}"? Its sign-in is removed for good and this can't be undone. Past scans keep its name.`}
          label="Delete"
          onYes={() => remove(confirmDelete)}
          onNo={() => setConfirmDelete(null)}
        />
      )}
      {confirmAll && (
        <Confirm
          title="Switch kiosks"
          message={`Switch ${activeKiosks.length} active kiosk${activeKiosks.length === 1 ? '' : 's'} to ${MODE_LABEL[confirmAll]}? They change within seconds, no refresh needed.`}
          label={`Switch to ${MODE_LABEL[confirmAll]}`}
          danger={false}
          onYes={() => setAll(confirmAll)}
          onNo={() => setConfirmAll(null)}
        />
      )}
      {confirmReset && (
        <Confirm
          message={`Reset the password for "${confirmReset.label}"? The device will be signed out within the hour and must be signed in again at /setup with the new password.`}
          label="Reset password"
          danger={false}
          onYes={async () => { await resetPassword(confirmReset); setConfirmReset(null); }}
          onNo={() => setConfirmReset(null)}
        />
      )}
      {credentials && (
        <Modal labelledBy="device-credentials-title" dismissible={false} onClose={() => {}}>
          <h2 id="device-credentials-title" style={S.h2}>{credentials.label} is ready</h2>
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
