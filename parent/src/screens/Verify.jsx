import { useState } from 'react';
import { sendEmailVerification, signOut } from 'firebase/auth';
import { auth } from '../firebase.js';
import S from '../strings.js';
import { Btn, Card, Banner } from '../components/ui.jsx';

export default function Verify({ user, onVerified }) {
  const [msg, setMsg] = useState(null);
  const check = async () => {
    await user.reload();
    if (!auth.currentUser.emailVerified) { setMsg(S.verifyNotYet); return; }
    // reload() updates the cached user profile (emailVerified flips true,
    // which is why we're allowed to move on at all) but the SDK's cached ID
    // token can keep its pre-verification email_verified:false claim for a
    // while longer -- and every guardian-callable request sends exactly
    // that claim. Best-effort pre-warm it here so the gap is as small as
    // possible; `callable()` (src/firebase.js) is what actually guarantees
    // freshness right before each call, since a single force-refresh issued
    // this close to reload() isn't reliably durable on its own.
    //
    // A hard `window.location.replace('/')` here (the original approach) is
    // additionally unsafe on its own terms: the SDK persists a refreshed
    // token to IndexedDB asynchronously, and a page teardown that races
    // that write can resurrect the pre-verification token on reload.
    // onVerified() is a soft, in-app transition with no navigation, so
    // nothing races that write.
    await auth.currentUser.getIdToken(true).catch(() => {});
    onVerified();
  };
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
