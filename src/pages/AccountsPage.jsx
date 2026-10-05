import { useMemo, useState } from 'react';
import { useCollectionResource } from '../hooks/useCollection.js';
import { staffUsers } from '../data/staffUsers.js';
import { ROLE_VALUES, ROLE_LABELS, ALL_GRADES, roleOf, roleLabel } from '../../shared/staffRoles.js';
import { T, S } from '../styles.js';
import { Btn, Inp, Sel, Field, Card, Modal, EmptyState, ResourceState, EditorResources } from '../components/ui.jsx';

// Admin-only account management. Every change goes through a callable that
// enforces the safeguards (no self-demote/disable/reset/delete, at least one
// active admin) server-side; the disabled buttons here only mirror them.
const statusOf = (u) => u.disabled ? 'Disabled' : u.mustChangePassword ? 'Must change password' : 'Active';
const errorText = (e) => e?.message || 'The action could not be completed. Please try again.';
const displayName = (u) => u.name || u.id;
const actions = { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 };

function AccountForm({ editing, self, onClose, onCreated }) {
  const [f, setF] = useState(editing
    ? { name: editing.name || '', email: editing.id, role: roleOf(editing) || 'glc', gradeLevel: editing.gradeLevel ? String(editing.gradeLevel) : '' }
    : { name: '', email: '', role: 'glc', gradeLevel: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    if (f.role === 'glc' && !f.gradeLevel) { setErr('Grade level is required for a Grade Level Coordinator.'); return; }
    setBusy(true); setErr('');
    const payload = { name: f.name.trim(), email: f.email.trim(), role: f.role, gradeLevel: f.role === 'glc' ? Number(f.gradeLevel) : null };
    try {
      if (editing) { await staffUsers.update(payload); onClose(); }
      else onCreated(await staffUsers.create(payload));
    } catch (e) { setErr(errorText(e)); setBusy(false); }
  };
  return (
    <Modal title={editing ? `Change ${displayName(editing)}` : 'Create account'} onClose={onClose} dismissible={!busy}>
      {err && <p role="alert" className="sims-feedback">{err}</p>}
      <Field label="Full name"><Inp value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
      <Field label="Email"><Inp type="email" value={f.email} disabled={!!editing} onChange={(e) => set('email', e.target.value)} /></Field>
      <Field label="Role">
        <Sel value={f.role} disabled={self} onChange={(e) => set('role', e.target.value)}>
          {ROLE_VALUES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </Sel>
      </Field>
      {self && <p style={{ fontFamily: T.body, fontSize: 12, color: T.inkMuted, marginTop: -6 }}>You can't change the role of your own account.</p>}
      {f.role === 'glc' && (
        <Field label="Grade level">
          <Sel value={f.gradeLevel} onChange={(e) => set('gradeLevel', e.target.value)}>
            <option value="">Choose a grade</option>
            {ALL_GRADES.map((g) => <option key={g} value={g}>Grade {g}</option>)}
          </Sel>
        </Field>
      )}
      <div style={actions}>
        <Btn variant="ghost" disabled={busy} onClick={onClose}>Cancel</Btn>
        <Btn disabled={busy} onClick={save}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create account'}</Btn>
      </div>
    </Modal>
  );
}

// Shown once after create/reset; the password lives only in this component's
// props and is gone when the dialog closes -- so only Done closes it (no
// overlay click / Escape).
function PasswordReveal({ result, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${result.email}\n${result.password}`); setCopied(true); }
    catch { setCopied(false); }
  };
  return (
    <Modal title="Temporary password" onClose={onClose} dismissible={false}>
      <p style={{ fontFamily: T.body, color: T.ink, fontSize: 14, lineHeight: 1.6, marginTop: 0 }}>
        Give these to the account owner now. <strong>This password can't be shown again.</strong> They'll be asked to choose their own when they sign in.
      </p>
      <Field label="Email"><Inp readOnly value={result.email} /></Field>
      <Field label="Temporary password"><Inp readOnly value={result.password} style={{ fontFamily: 'ui-monospace, monospace' }} /></Field>
      <div style={actions}>
        <Btn variant="ghost" onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</Btn>
        <Btn onClick={onClose}>Done</Btn>
      </div>
    </Modal>
  );
}

function ActionConfirm({ title, message, label, danger = false, typeToConfirm, onYes, onClose }) {
  const [typed, setTyped] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const blocked = typeToConfirm && typed.trim().toLowerCase() !== typeToConfirm;
  const yes = async () => {
    setBusy(true); setErr('');
    try { await onYes(); } catch (e) { setErr(errorText(e)); setBusy(false); }
  };
  return (
    <Modal title={title} onClose={onClose} dismissible={!busy}>
      <p style={{ fontFamily: T.body, color: T.ink, fontSize: 14, lineHeight: 1.6, marginTop: 0 }}>{message}</p>
      {typeToConfirm && <Field label={`Type ${typeToConfirm} to confirm`}><Inp value={typed} onChange={(e) => setTyped(e.target.value)} /></Field>}
      {err && <p role="alert" className="sims-feedback">{err}</p>}
      <div style={actions}>
        <Btn variant="ghost" disabled={busy} onClick={onClose}>Cancel</Btn>
        <Btn disabled={busy || blocked} onClick={yes} style={{ background: danger ? T.absent : T.primary }}>{busy ? 'Working…' : label}</Btn>
      </div>
    </Modal>
  );
}

export default function AccountsPage({ me }) {
  const usersResource = useCollectionResource('users');
  const rows = useMemo(() => [...usersResource.data].sort((a, b) => displayName(a).localeCompare(displayName(b))), [usersResource.data]);
  const [form, setForm] = useState(null);       // {} = create, user = change
  const [pending, setPending] = useState(null); // { kind, user }
  const [reveal, setReveal] = useState(null);   // { email, password }
  const resources = [usersResource];

  const confirmFor = ({ kind, user }) => {
    const name = displayName(user);
    const done = () => setPending(null);
    if (kind === 'reset') return { title: 'Reset password', label: 'Reset password',
      message: `Generate a new temporary password for ${name}? Their current password stops working and they'll be signed out.`,
      onYes: async () => { const r = await staffUsers.resetPassword({ email: user.id }); done(); setReveal(r); } };
    if (kind === 'disable') return { title: 'Disable account', label: 'Disable', danger: true,
      message: `Disable ${name}? They'll be signed out and can't sign in until the account is re-enabled.`,
      onYes: async () => { await staffUsers.setDisabled({ email: user.id, disabled: true }); done(); } };
    if (kind === 'enable') return { title: 'Re-enable account', label: 'Re-enable',
      message: `Re-enable ${name}? They'll be able to sign in again.`,
      onYes: async () => { await staffUsers.setDisabled({ email: user.id, disabled: false }); done(); } };
    return { title: 'Delete account', label: 'Delete permanently', danger: true, typeToConfirm: user.id,
      message: `Permanently delete ${name}'s account? This can't be undone. Their audit history is kept.`,
      onYes: async () => { await staffUsers.remove({ email: user.id }); done(); } };
  };

  return (
    <EditorResources resources={resources}><div>
      <ResourceState resources={resources} label="accounts">
        <div className="sims-heading" style={S.plate}>
          <h1 style={S.h1}>Accounts</h1>
          <Btn onClick={() => setForm({})}>Create account</Btn>
        </div>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {rows.length === 0 ? <EmptyState title="No accounts yet" hint="Create the first staff account with the button above." /> : (
            <div className="sims-table-scroll" role="region" aria-label="Accounts" tabIndex={0}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={S.thead}>{['Name', 'Email', 'Role', 'Status', ''].map((h) => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>{rows.map((u) => {
                const self = u.id === me.email;
                return (
                  <tr key={u.id}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{displayName(u)}{self && <span style={{ color: T.inkMuted, fontWeight: 400 }}> (you)</span>}</td>
                    <td style={S.td}>{u.id}</td>
                    <td style={S.td}>{roleLabel(u)}</td>
                    <td style={{ ...S.td, color: u.disabled ? T.absent : T.ink }}>{statusOf(u)}</td>
                    <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Btn variant="ghost" onClick={() => setForm(u)} style={{ marginRight: 6 }}>Change</Btn>
                      <Btn variant="ghost" disabled={self} onClick={() => setPending({ kind: 'reset', user: u })} style={{ marginRight: 6 }}>Reset password</Btn>
                      <Btn variant="ghost" disabled={self} onClick={() => setPending({ kind: u.disabled ? 'enable' : 'disable', user: u })} style={{ marginRight: 6 }}>{u.disabled ? 'Enable' : 'Disable'}</Btn>
                      <Btn variant="ghost" disabled={self} onClick={() => setPending({ kind: 'delete', user: u })} style={{ color: T.absent, borderColor: T.absent }}>Delete</Btn>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          )}
        </Card>
      </ResourceState>
      {form && <AccountForm editing={form.id ? form : null} self={form.id === me.email} onClose={() => setForm(null)} onCreated={(r) => { setForm(null); setReveal(r); }} />}
      {pending && <ActionConfirm {...confirmFor(pending)} onClose={() => setPending(null)} />}
      {reveal && <PasswordReveal result={reveal} onClose={() => setReveal(null)} />}
    </div></EditorResources>
  );
}
