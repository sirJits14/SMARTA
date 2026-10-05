import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase.js';
import { DISABLED_MESSAGE } from '../lib/access.js';
import { T, S } from '../styles.js';
import { Btn, Inp, Field } from './ui.jsx';
import smartaWordmark from '../assets/smarta-wordmark.png';

// Profile checks (missing, disabled, role) happen in App's live profile
// subscription, which signs the user back out and hands us `notice`.
export default function Login({ notice = '', onAttempt }) {
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setErr(''); onAttempt?.();
    try { await signInWithEmailAndPassword(auth, email.trim(), pw); }
    catch (e) { setErr(e?.code === 'auth/user-disabled' ? DISABLED_MESSAGE : 'That email and password did not match.'); }
    setBusy(false);
  };
  const shown = err || notice;
  return (
    <div style={{ ...S.page, display: 'grid', placeItems: 'center' }}>
      <div style={{ ...S.card, width: 360 }}>
        <h1 style={{ margin: '0 0 6px', lineHeight: 0 }}><img src={smartaWordmark} alt="SMARTA" width={240} height={71} style={{ display: 'block' }} /></h1>
        <p style={{ fontFamily: T.body, color: T.inkMuted, fontSize: 12, marginTop: 0, marginBottom: 20 }}>Staff sign-in</p>
        {shown && <div role="alert" style={{ fontFamily: T.body, background: 'rgba(220,38,38,0.08)', color: T.absent, borderRadius: 10, padding: '9px 12px', fontSize: 12, marginBottom: 14 }}>{shown}</div>}
        <Field label="Email"><Inp type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} /></Field>
        <Field label="Password"><Inp type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} /></Field>
        <Btn onClick={go} disabled={busy} style={{ width: '100%', marginTop: 6, opacity: busy ? 0.6 : 1 }}>{busy ? 'Signing in…' : 'Sign in'}</Btn>
      </div>
    </div>
  );
}
