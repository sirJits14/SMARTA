import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase.js';
import { endSession } from '../session.js';
import { staffUsers } from '../data/staffUsers.js';
import { passwordProblem, waitForPasswordSession, MIN_PASSWORD } from '../lib/password.js';
import { Btn, Inp, Field } from './ui.jsx';
import smartaWordmark from '../assets/smarta-wordmark-sidebar.png';
import smartaWordmarkDark from '../assets/smarta-wordmark-sidebar-dark.png';

// Shown instead of the app while users/{email}.mustChangePassword is true
// (new account or admin reset). The live profile clears it on success.
export default function ChangePassword({ me, onLogout, onChanging, onReauthenticated }) {
  const [pw, setPw] = useState(''); const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const go = async () => {
    const problem = passwordProblem(pw, confirm);
    if (problem) { setErr(problem); return; }
    setBusy(true); setErr('');
    onChanging?.(true);
    try {
      const result = await staffUsers.changeOwnPassword({ newPassword: pw });
      await waitForPasswordSession(result?.sessionValidAfter);
    } catch (e) {
      setErr(e?.message || 'Could not change the password. Please try again.');
      setBusy(false);
      onChanging?.(false);
      return;
    }
    // A password change revokes the current session; sign straight back in,
    // or out to the login screen (with the new password) if that fails.
    try {
      await signInWithEmailAndPassword(auth, me.email, pw);
      await onReauthenticated?.();
    }
    catch { await endSession(); }
    finally { onChanging?.(false); }
  };
  const submit = (e) => { e.preventDefault(); if (!busy) go(); };
  return (
    <main className="sims-auth">
      <form className="sims-auth-card" onSubmit={submit} noValidate>
        <img className="sims-auth-logo theme-light-only" src={smartaWordmark} alt="SMARTA" width={188} height={54} />
        <img className="sims-auth-logo theme-dark-only" src={smartaWordmarkDark} alt="SMARTA" width={188} height={54} />
        <h1 className="sims-auth-title">Set a new password</h1>
        <p className="sims-auth-sub">
          {me.email} is using a temporary password. Choose your own ({MIN_PASSWORD}+ characters) to continue.
        </p>
        {err && <div role="alert" className="sims-auth-alert">{err}</div>}
        <input type="email" autoComplete="username" value={me.email} readOnly hidden />
        <Field label="New password"><Inp type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Field label="Confirm new password"><Inp type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
        <div className="sims-auth-actions">
          <Btn type="submit" loading={busy} className="sims-btn--block">{busy ? 'Saving…' : 'Save password'}</Btn>
          <Btn type="button" variant="ghost" onClick={onLogout} disabled={busy} className="sims-btn--block">Sign out</Btn>
        </div>
      </form>
    </main>
  );
}
