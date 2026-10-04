import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase.js';
import { staffUsers } from '../data/staffUsers.js';
import { passwordProblem, MIN_PASSWORD } from '../lib/password.js';
import { T, S } from '../styles.js';
import { Btn, Inp, Field } from './ui.jsx';
import simsLogo from '../assets/sims-logo.png';

// Shown instead of the app while users/{email}.mustChangePassword is true
// (new account or admin reset). The live profile clears it on success.
export default function ChangePassword({ me, onLogout }) {
  const [pw, setPw] = useState(''); const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const go = async () => {
    const problem = passwordProblem(pw, confirm);
    if (problem) { setErr(problem); return; }
    setBusy(true); setErr('');
    try {
      await staffUsers.changeOwnPassword({ newPassword: pw });
      // A password change revokes the current session; sign straight back in.
      await signInWithEmailAndPassword(auth, me.email, pw);
    } catch (e) {
      setErr(e?.message || 'Could not change the password. Please try again.');
      setBusy(false);
    }
  };
  const enter = (e) => e.key === 'Enter' && go();
  return (
    <div style={{ ...S.page, display: 'grid', placeItems: 'center' }}>
      <div style={{ ...S.card, width: 380 }}>
        <img src={simsLogo} alt="BNHS SIMS logo" width={40} height={40} style={{ marginBottom: 16 }} />
        <h1 style={{ fontFamily: T.display, color: T.ink, fontSize: 20, margin: '0 0 2px', fontWeight: 700 }}>Set a new password</h1>
        <p style={{ fontFamily: T.body, color: T.inkMuted, fontSize: 12, marginTop: 0, marginBottom: 20 }}>
          {me.email} is using a temporary password. Choose your own ({MIN_PASSWORD}+ characters) to continue.
        </p>
        {err && <div role="alert" style={{ fontFamily: T.body, background: 'rgba(220,38,38,0.08)', color: T.absent, borderRadius: 10, padding: '9px 12px', fontSize: 12, marginBottom: 14 }}>{err}</div>}
        <Field label="New password"><Inp type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={enter} /></Field>
        <Field label="Confirm new password"><Inp type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={enter} /></Field>
        <Btn onClick={go} disabled={busy} style={{ width: '100%', marginTop: 6, opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Save password'}</Btn>
        <Btn variant="ghost" onClick={onLogout} disabled={busy} style={{ width: '100%', marginTop: 8 }}>Sign out</Btn>
      </div>
    </div>
  );
}
