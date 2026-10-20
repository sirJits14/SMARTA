import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase.js';
import { signInErrorMessage } from '../lib/authErrors.js';
import { Btn, Inp, Field } from './ui.jsx';
import smartaWordmark from '../assets/smarta-wordmark-sidebar.png';
import smartaWordmarkDark from '../assets/smarta-wordmark-sidebar-dark.png';

// Profile checks (missing, disabled, role) happen in App's live profile
// subscription, which signs the user back out and hands us `notice`.
export default function Login({ notice = '', onAttempt }) {
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setErr(''); onAttempt?.();
    try { await signInWithEmailAndPassword(auth, email.trim(), pw); }
    catch (e) { setErr(signInErrorMessage(e)); }
    setBusy(false);
  };
  const shown = err || notice;
  const submit = (e) => { e.preventDefault(); if (!busy) go(); };
  return (
    <main className="sims-auth">
      <form className="sims-auth-card" onSubmit={submit} noValidate>
        <img className="sims-auth-logo theme-light-only" src={smartaWordmark} alt="SMARTA" width={188} height={54} />
        <img className="sims-auth-logo theme-dark-only" src={smartaWordmarkDark} alt="SMARTA" width={188} height={54} />
        <h1 className="sims-auth-title">Staff sign-in</h1>
        <p className="sims-auth-sub">BNHS Learner Records</p>
        {shown && <div role="alert" className="sims-auth-alert">{shown}</div>}
        <Field label="Email"><Inp type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password"><Inp type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Btn type="submit" loading={busy} className="sims-btn--block sims-auth-submit">{busy ? 'Signing in…' : 'Sign in'}</Btn>
      </form>
    </main>
  );
}
