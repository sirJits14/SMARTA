import { useEffect, useState } from 'react';
import { signInWithPopup, signInWithRedirect, getRedirectResult, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendEmailVerification, sendPasswordResetEmail } from 'firebase/auth';
import { auth, googleProvider } from '../firebase.js';
import { authErrorMessage, needsRedirect } from '../lib/authErrors.js';
import S from '../strings.js';
import { T } from '../styles.js';
import { Btn, Card, Field, Inp, Banner } from '../components/ui.jsx';

export default function SignIn() {
  const [mode, setMode] = useState('choose'); // choose | email | create
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false);

  const fail = (e, fallback) => { const text = authErrorMessage(e, fallback); if (text) setMsg({ tone: 'danger', text }); };
  const run = async (fn, fallback) => { setBusy(true); setMsg(null); try { await fn(); } catch (e) { fail(e, fallback); } setBusy(false); };
  // Coming back from a Google redirect sign-in (the fallback below): a
  // success is picked up by onAuthStateChanged; only failures land here.
  useEffect(() => { getRedirectResult(auth).catch((e) => fail(e)); }, []);
  const google = () => run(async () => {
    try { await signInWithPopup(auth, googleProvider); }
    catch (e) { if (needsRedirect(e)) await signInWithRedirect(auth, googleProvider); else throw e; }
  });
  const signIn = () => run(() => signInWithEmailAndPassword(auth, email.trim(), pw), S.authError);
  const create = () => {
    if (name.trim().length < 2) { setMsg({ tone: 'danger', text: S.nameRequired }); return; }
    return run(async () => { const c = await createUserWithEmailAndPassword(auth, email.trim(), pw); await updateProfile(c.user, { displayName: name.trim() }); await sendEmailVerification(c.user); }, S.createError);
  };
  // Same answer whether or not the address has an account.
  const reset = async () => { setBusy(true); setMsg(null); try { await sendPasswordResetEmail(auth, email.trim()); } catch {} setMsg({ tone: 'info', text: S.resetSent }); setBusy(false); };

  return (
    <div style={{ fontFamily: T.font, minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 16 }}>
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
            {mode === 'create' && <Field label={S.yourName} hint={S.yourNameHint}><Inp autoComplete="name" autoCapitalize="words" value={name} onChange={(e) => setName(e.target.value)} /></Field>}
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
