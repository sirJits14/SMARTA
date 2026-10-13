import { useCallback, useState } from 'react';
import { updateProfile } from 'firebase/auth';
import { callable } from '../firebase.js';
import S from '../strings.js';
import { nameCase } from '../lib/format.js';
import { Btn, Card, Field, Inp, Sel, Banner } from '../components/ui.jsx';
import { useDoc } from '../hooks/useDoc.js';

const RELATIONSHIPS = ['Mother', 'Father', 'Guardian', 'Grandparent', 'Sibling', 'Other'];
const ADVISER = 'Adviser';
const normalize = (v) => v.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 8);
const pretty = (v) => (v.length > 4 ? `${v.slice(0, 4)}-${v.slice(4)}` : v);

export default function Activate({ user, profile, route, navigate }) {
  const portal = useDoc('settings/parent_portal').data;
  const [code, setCode] = useState(normalize(route.query.c || ''));
  // Prefilled from the guardian profile, else the Google account name or the
  // name typed when the email account was created.
  const [guardianName, setGuardianName] = useState(profile?.displayName || user?.displayName || '');
  const [relationship, setRelationship] = useState('Mother');
  // Camera code and the jsQR fallback are fetched only when the parent taps
  // Scan. A failed download is reported inline; the form stays usable.
  const [Sheet, setSheet] = useState(null);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null); const [done, setDone] = useState(null);
  const [skipping, setSkipping] = useState(false);

  const closeScan = useCallback(() => setSheet(null), []);
  const scanned = useCallback((c) => { setCode(c); setErr(null); setSheet(null); }, []);
  const openScan = () => {
    if (loadingSheet) return;
    setLoadingSheet(true); setErr(null);
    import('../components/ScanSheet.jsx')
      .then((m) => setSheet(() => m.default))
      .catch(() => setErr(S.scanLoadFailed))
      .finally(() => setLoadingSheet(false));
  };

  const submit = async () => {
    if (busy || skipping) return;
    setBusy(true); setErr(null);
    let consentVersion = portal?.consentVersion ?? 1;
    try { const stored = localStorage.getItem('bnhs-parent-consent'); if (stored) consentVersion = Number(stored); } catch {}
    const name = guardianName.trim();
    try {
      const r = await callable('activateCodeFn')({ code, relationship, consentVersion, guardianName: name });
      if (user && user.displayName !== name) updateProfile(user, { displayName: name }).catch(() => {});
      setDone(r.data);
    }
    catch (e) { setErr(String(e?.code || '').endsWith('permission-denied') ? S.activateAdviserDeped : S.activateFailed); }
    setBusy(false);
  };

  const skip = async () => {
    if (busy || skipping) return;
    setSkipping(true); setErr(null);
    try {
      // A server-side profile lets App admit this account on every device,
      // and makes Settings usable before the first learner is linked.
      let acceptedConsentVersion;
      try { acceptedConsentVersion = Number(localStorage.getItem('bnhs-parent-consent')); } catch {}
      if (acceptedConsentVersion !== (portal?.consentVersion ?? 1)) {
        navigate('/consent'); return;
      }
      await callable('acceptConsentFn')({ acceptedConsentVersion });
      navigate('/');
    } catch (e) {
      if (String(e?.code || '').endsWith('failed-precondition')) navigate('/consent');
      else setErr(S.activateSkipFailed);
    }
    finally { setSkipping(false); }
  };

  if (done) return (
    <Card>
      <h1 style={{ fontSize: 20 }}>{S.activateSuccess} {nameCase(done.displayName)}</h1>
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
      <Btn variant="ghost" onClick={openScan} disabled={loadingSheet || busy || skipping} style={{ width: '100%', marginBottom: 14 }}>{S.scanButton}</Btn>
      <Field label={S.activateCodeLabel}><Inp inputMode="text" autoCapitalize="characters" autoComplete="one-time-code" value={pretty(code)} onChange={(e) => setCode(normalize(e.target.value))} style={{ letterSpacing: '0.12em', fontSize: 20, textAlign: 'center' }} /></Field>
      <Field label={S.yourName} hint={S.yourNameHint}><Inp autoComplete="name" autoCapitalize="words" maxLength={120} value={guardianName} onChange={(e) => setGuardianName(e.target.value)} /></Field>
      <Field label={S.activateRelationship} hint={relationship === ADVISER ? S.activateAdviserHint : undefined}>
        <Sel value={relationship} onChange={(e) => setRelationship(e.target.value)}>
          {RELATIONSHIPS.map((r) => <option key={r}>{r}</option>)}
          <option value={ADVISER}>{S.activateAdviserOption}</option>
        </Sel>
      </Field>
      <Btn onClick={submit} disabled={busy || skipping || code.length !== 8 || guardianName.trim().length < 2} style={{ width: '100%' }}>{S.activateButton}</Btn>
      <p style={{ textAlign: 'center' }}><a href="/request-access" onClick={(e) => { e.preventDefault(); navigate('/request-access'); }}>{S.activateNoSlip}</a></p>
      {!profile && <Btn variant="ghost" onClick={skip} disabled={busy || skipping} style={{ width: '100%' }}>{skipping ? S.activateSkipping : S.activateSkip}</Btn>}
      {Sheet && <Sheet onCode={scanned} onClose={closeScan} />}
    </Card>
  );
}
