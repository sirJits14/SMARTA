import { useState } from 'react';
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail } from 'firebase/auth';
import { auth, googleProvider } from '../firebase.js';
import S from '../strings.js';
import { T } from '../styles.js';
import { Btn, Card, Field, Inp, Banner } from '../components/ui.jsx';

export default function SignIn() {
  const [mode, setMode] = useState('choose'); // choose | email | create
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false);

  const run = async (fn, failText) => { setBusy(true); setMsg(null); try { await fn(); } catch { setMsg({ tone: 'danger', text: failText }); } setBusy(false); };
  const google = () => run(() => signInWithPopup(auth, googleProvider), S.authError);
  const signIn = () => run(() => signInWithEmailAndPassword(auth, email.trim(), pw), S.authError);
  const create = () => run(async () => { const c = await createUserWithEmailAndPassword(auth, email.trim(), pw); await sendEmailVerification(c.user); }, S.createError);
  const reset = () => run(async () => { await sendPasswordResetEmail(auth, email.trim()); setMsg({ tone: 'info', text: S.resetSent }); }, S.resetSent);

  return (
    <div style={{ fontFamily: T.font, background: T.bg, minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <Card style={{ width: '100%', maxWidth: 400 }}>
        <img src="/icons/icon-192.png" alt="" width={48} height={48} />
        <h1 style={{ fontSize: 22, margin: '8px 0 2px' }}>{S.appName}</h1>
        <p style={{ color: T.inkMuted, fontSize: 14, marginTop: 0 }}>{S.tagline}</p>
        {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}
        {mode === 'choose' && (
          <div style={{ display: 'grid', gap: 10 }}>
            <Btn onClick={google} disabled={busy}>{S.signInGoogle}</Btn>
            <Btn variant="ghost" onClick={() => setMode('email')}>{S.signInEmail}</Btn>
          </div>
        )}
        {mode !== 'choose' && (
          <>
            <Field label={S.email}><Inp type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label={S.password}><Inp type="password" autoComplete={mode === 'create' ? 'new-password' : 'current-password'} value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
            <div style={{ display: 'grid', gap: 10 }}>
              {mode === 'email' ? <Btn onClick={signIn} disabled={busy}>{S.signIn}</Btn> : <Btn onClick={create} disabled={busy}>{S.createAccount}</Btn>}
              {mode === 'email' && <Btn variant="ghost" onClick={() => setMode('create')}>{S.createAccount}</Btn>}
              {mode === 'email' && <Btn variant="ghost" onClick={reset} disabled={busy || !email}>{S.forgotPassword}</Btn>}
              <Btn variant="ghost" onClick={() => setMode('choose')}>{S.back}</Btn>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
