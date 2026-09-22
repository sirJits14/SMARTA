import { useState } from 'react';
import { sendEmailVerification, signOut } from 'firebase/auth';
import { auth } from '../firebase.js';
import S from '../strings.js';
import { Btn, Card, Banner } from '../components/ui.jsx';

export default function Verify({ user }) {
  const [msg, setMsg] = useState(null);
  const check = async () => { await user.reload(); if (!auth.currentUser.emailVerified) setMsg(S.verifyNotYet); else window.location.replace('/'); };
  return (
    <Card>
      <h1 style={{ fontSize: 20 }}>{S.verifyTitle}</h1>
      <p>{S.verifyBody}</p>
      {msg && <Banner tone="warn">{msg}</Banner>}
      <div style={{ display: 'grid', gap: 10 }}>
        <Btn onClick={check}>{S.continue}</Btn>
        <Btn variant="ghost" onClick={() => sendEmailVerification(user)}>{S.verifyResend}</Btn>
        <Btn variant="ghost" onClick={() => signOut(auth)}>{S.signOut}</Btn>
      </div>
    </Card>
  );
}
