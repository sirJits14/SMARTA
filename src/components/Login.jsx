import { useState } from 'react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase.js';
import { T, S } from '../styles.js';
import { Btn, Inp, Field } from './ui.jsx';

export default function Login({ onSignedIn }) {
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setErr('');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pw);
      const snap = await getDoc(doc(db, 'users', email.trim().toLowerCase()));
      if (!snap.exists()) { await signOut(auth); setErr('This account has no registrar profile yet. Ask an admin to add one.'); setBusy(false); return; }
      onSignedIn({ email: email.trim().toLowerCase(), ...snap.data() });
    } catch { setErr('That email and password did not match.'); }
    setBusy(false);
  };
  return (
    <div style={{ ...S.page, display: 'grid', placeItems: 'center' }}>
      <div style={{ ...S.card, width: 360 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: T.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 17, marginBottom: 16 }}>B</div>
        <h1 style={{ fontFamily: T.display, color: T.ink, fontSize: 22, margin: '0 0 2px', fontWeight: 700 }}>BNHS SIMS</h1>
        <p style={{ fontFamily: T.body, color: T.inkMuted, fontSize: 12, marginTop: 0, marginBottom: 20 }}>Registrar sign-in</p>
        {err && <div style={{ fontFamily: T.body, background: 'rgba(220,38,38,0.08)', color: T.absent, borderRadius: 10, padding: '9px 12px', fontSize: 12, marginBottom: 14 }}>{err}</div>}
        <Field label="Email"><Inp type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} /></Field>
        <Field label="Password"><Inp type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} /></Field>
        <Btn onClick={go} disabled={busy} style={{ width: '100%', marginTop: 6, opacity: busy ? 0.6 : 1 }}>{busy ? 'Signing in…' : 'Sign in'}</Btn>
      </div>
    </div>
  );
}
