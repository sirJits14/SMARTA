import { useState } from 'react';
import { updateProfile } from 'firebase/auth';
import { callable } from '../firebase.js';
import S from '../strings.js';
import { Btn, Card, Field, Inp, Sel, Banner } from '../components/ui.jsx';
import { useDoc } from '../hooks/useDoc.js';

const RELATIONSHIPS = ['Mother', 'Father', 'Guardian', 'Grandparent', 'Sibling', 'Other'];
const normalize = (v) => v.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 8);
const pretty = (v) => (v.length > 4 ? `${v.slice(0, 4)}-${v.slice(4)}` : v);

export default function Activate({ user, profile, route, navigate }) {
  const portal = useDoc('settings/parent_portal').data;
  const [code, setCode] = useState(normalize(route.query.c || ''));
  // Prefilled from the guardian profile, else the Google account name or the
  // name typed when the email account was created.
  const [guardianName, setGuardianName] = useState(profile?.displayName || user?.displayName || '');
  const [relationship, setRelationship] = useState('Mother');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null); const [done, setDone] = useState(null);

  const submit = async () => {
    setBusy(true); setErr(null);
    let consentVersion = portal?.consentVersion ?? 1;
    try { const stored = localStorage.getItem('bnhs-parent-consent'); if (stored) consentVersion = Number(stored); } catch {}
    const name = guardianName.trim();
    try {
      const r = await callable('activateCodeFn')({ code, relationship, consentVersion, guardianName: name });
      if (user && user.displayName !== name) updateProfile(user, { displayName: name }).catch(() => {});
      setDone(r.data);
    }
    catch { setErr(S.activateFailed); }
    setBusy(false);
  };

  if (done) return (
    <Card>
      <h1 style={{ fontSize: 20 }}>{S.activateSuccess} {done.displayName}</h1>
      <p>{done.sectionLabel}</p>
      <div style={{ display: 'grid', gap: 10 }}>
        <Btn onClick={() => navigate('/')}>{S.continue}</Btn>
        <Btn variant="ghost" onClick={() => { setDone(null); setCode(''); }}>{S.activateAnother}</Btn>
      </div>
    </Card>
  );
  return (
    <Card>
      <h1 style={{ fontSize: 20 }}>{S.activateTitle}</h1>
      <p>{S.activateBody}</p>
      {err && <Banner tone="danger">{err}</Banner>}
      <Field label={S.activateCodeLabel}><Inp inputMode="text" autoCapitalize="characters" autoComplete="one-time-code" value={pretty(code)} onChange={(e) => setCode(normalize(e.target.value))} style={{ letterSpacing: '0.12em', fontSize: 20, textAlign: 'center' }} /></Field>
      <Field label={S.yourName} hint={S.yourNameHint}><Inp autoComplete="name" autoCapitalize="words" maxLength={120} value={guardianName} onChange={(e) => setGuardianName(e.target.value)} /></Field>
      <Field label={S.activateRelationship}><Sel value={relationship} onChange={(e) => setRelationship(e.target.value)}>{RELATIONSHIPS.map((r) => <option key={r}>{r}</option>)}</Sel></Field>
      <Btn onClick={submit} disabled={busy || code.length !== 8 || guardianName.trim().length < 2} style={{ width: '100%' }}>{S.activateButton}</Btn>
      <p style={{ textAlign: 'center' }}><a href="/request-access" onClick={(e) => { e.preventDefault(); navigate('/request-access'); }}>{S.activateNoSlip}</a></p>
    </Card>
  );
}
