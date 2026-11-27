import { useState } from 'react';
import { callable } from '../../firebase.js';
import S from '../../strings.js';
import { Banner, Btn, Card, Field, Inp, Sel } from '../../components/ui.jsx';
import { useDoc } from '../../hooks/useDoc.js';
import { useScanSheet } from '../../hooks/useScanSheet.js';
import { RELATIONSHIPS } from '../../lib/relationships.js';
import { codeDraft, initialCode, prettyCode } from '../../lib/join.js';
import StepHeader from './StepHeader.jsx';

export default function FamilyStep({ name, query, navigate, label, onDone, onSkip }) {
  const portal = useDoc('settings/parent_portal').data;
  const [code, setCode] = useState(() => initialCode(query, 'family'));
  const [relationship, setRelationship] = useState('Mother');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const scan = useScanSheet();
  const scanned = (value, kind) => { scan.close(); if (kind !== 'learner') { setErr(S.familyWrongKind); return; } setCode(value); setErr(''); };
  const submit = async () => {
    if (busy) return;
    setBusy(true); setErr('');
    let consentVersion = portal?.consentVersion ?? 1;
    try { const stored = localStorage.getItem('bnhs-parent-consent'); if (stored) consentVersion = Number(stored); } catch {}
    try {
      const r = await callable('activateCodeFn')({ code, relationship, consentVersion, guardianName: name.trim() });
      onDone({ outcome: 'active', detail: r.data.displayName });
    } catch { setErr(S.activateFailed); }
    finally { setBusy(false); }
  };
  return (
    <Card>
      <StepHeader label={label} title={S.activateTitle}>{S.activateBody}</StepHeader>
      {(err || scan.error) && <Banner tone="danger">{err || scan.error}</Banner>}
      <Btn variant="ghost" onClick={scan.open} disabled={scan.loading || busy} style={{ width: '100%', marginBottom: 14 }}>{S.scanButton}</Btn>
      <Field label={S.activateCodeLabel}><Inp inputMode="text" autoCapitalize="characters" autoComplete="one-time-code" value={prettyCode(code)}
        onChange={(e) => setCode(codeDraft(e.target.value))} style={{ letterSpacing: '0.12em', fontSize: 20, textAlign: 'center' }} /></Field>
      <Field label={S.activateRelationship}>
        <Sel value={relationship} onChange={(e) => setRelationship(e.target.value)}>{RELATIONSHIPS.map((r) => <option key={r}>{r}</option>)}</Sel>
      </Field>
      <Btn onClick={submit} disabled={busy || code.length !== 8} style={{ width: '100%' }}>{S.activateButton}</Btn>
      <p style={{ textAlign: 'center' }}><a href="/request-access" onClick={(e) => { e.preventDefault(); navigate('/request-access'); }}>{S.activateNoSlip}</a></p>
      <Btn variant="ghost" onClick={onSkip} disabled={busy} style={{ width: '100%' }}>{S.joinSkipStep}</Btn>
      {scan.Sheet && <scan.Sheet kind="learner" onCode={scanned} onClose={scan.close} />}
    </Card>
  );
}
