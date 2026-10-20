import { useState } from 'react';
import { callable } from '../../firebase.js';
import S from '../../strings.js';
import { Banner, Btn, Card, Field, Inp, Sel } from '../../components/ui.jsx';
import { useScanSheet } from '../../hooks/useScanSheet.js';
import { isDepedEmail } from '../../../../shared/schoolAccess.js';
import { codeDraft, initialCode, prettyCode } from '../../lib/join.js';
import { schoolError, sectionLabel, sectionsByGrade } from '../../lib/school.js';
import StepHeader from './StepHeader.jsx';

export default function AdviserStep({ user, school, query, label, onDone, onSkip }) {
  const deped = isDepedEmail(user.email);
  const [mode, setMode] = useState(deped ? 'slip' : 'request');
  const [code, setCode] = useState(() => initialCode(query, 'adviser'));
  const [preview, setPreview] = useState(null);
  const [sectionId, setSectionId] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const scan = useScanSheet();
  const sections = school.data?.sections || [];
  const run = async (fn) => {
    if (busy) return;
    setBusy(true); setErr(null);
    try { await fn(); } catch (e) { setErr({ text: schoolError(e), deped: String(e?.code || '').endsWith('permission-denied') }); }
    finally { setBusy(false); }
  };
  const check = () => run(async () => setPreview((await callable('previewAdvisorySlipFn')({ code })).data));
  const redeem = () => run(async () => { const r = (await callable('redeemAdvisorySlipFn')({ code })).data; onDone({ outcome: 'active', detail: r.sectionLabel }); });
  const request = () => run(async () => {
    await callable('requestSchoolRoleFn')({ role: 'adviser', sectionId });
    onDone({ outcome: 'pending', detail: sectionLabel(sections.find((s) => s.id === sectionId)) });
  });
  const scanned = (value, kind) => { scan.close(); if (kind !== 'advisory') { setErr({ text: S.adviserWrongKind }); return; } setCode(value); setPreview(null); setErr(null); };
  const toRequest = () => { setMode('request'); setErr(null); setPreview(null); };

  if (school.data?.ended) return <Card><StepHeader label={label} title={S.adviserRequestTitle}>{S.schoolAccessEnded}</StepHeader>
    <Btn variant="ghost" onClick={onSkip} style={{ width: '100%' }}>{S.joinSkipStep}</Btn></Card>;

  if (mode === 'slip' && preview) return (
    <Card>
      <StepHeader label={label} title={S.adviserConfirmTitle} />
      {err && <Banner tone="danger">{err.text}</Banner>}
      <p style={{ fontSize: 22, fontWeight: 600, margin: '8px 0 16px' }}>{preview.sectionLabel}</p>
      <div style={{ display: 'grid', gap: 10 }}>
        <Btn onClick={redeem} disabled={busy}>{S.adviserConfirm}</Btn>
        <Btn variant="ghost" onClick={() => { setPreview(null); setCode(''); }} disabled={busy}>{S.adviserNotMine}</Btn>
      </div>
    </Card>
  );

  if (mode === 'slip') return (
    <Card>
      <StepHeader label={label} title={S.adviserSlipTitle}>{S.adviserSlipBody}</StepHeader>
      {(err || scan.error) && <Banner tone="danger" action={err?.deped ? <Btn variant="ghost" onClick={toRequest}>{S.adviserRequestInstead}</Btn> : undefined}>{err?.text || scan.error}</Banner>}
      <Btn variant="ghost" onClick={scan.open} disabled={scan.loading || busy} style={{ width: '100%', marginBottom: 14 }}>{S.adviserScan}</Btn>
      <Field label={S.adviserCodeLabel}><Inp inputMode="text" autoCapitalize="characters" autoComplete="one-time-code" value={prettyCode(code)}
        onChange={(e) => { setCode(codeDraft(e.target.value)); setPreview(null); }} style={{ letterSpacing: '0.12em', fontSize: 20, textAlign: 'center' }} /></Field>
      <Btn onClick={check} disabled={busy || code.length !== 8} style={{ width: '100%' }}>{S.adviserCheck}</Btn>
      <p style={{ textAlign: 'center' }}><a href="#request" onClick={(e) => { e.preventDefault(); toRequest(); }}>{S.adviserNoSlip}</a></p>
      <Btn variant="ghost" onClick={onSkip} disabled={busy} style={{ width: '100%' }}>{S.joinSkipStep}</Btn>
      {scan.Sheet && <scan.Sheet kind="advisory" title={S.adviserScanTitle} onCode={scanned} onClose={scan.close} />}
    </Card>
  );

  return (
    <Card>
      <StepHeader label={label} title={S.adviserRequestTitle}>{S.adviserRequestBody}</StepHeader>
      {err && <Banner tone="danger">{err.text}</Banner>}
      <Field label={S.schoolAccessSection}><Sel required value={sectionId} disabled={busy} onChange={(e) => setSectionId(e.target.value)}>
        <option value="">{S.schoolAccessChooseSection}</option>
        {sectionsByGrade(sections).map((g) => <optgroup key={g.grade} label={`${S.schoolAccessGrade} ${g.grade}`}>
          {g.sections.map((s) => <option key={s.id} value={s.id}>{s.name || s.id}</option>)}</optgroup>)}</Sel></Field>
      <Btn onClick={request} disabled={busy || !sectionId} style={{ width: '100%' }}>{S.schoolAccessSubmit}</Btn>
      {deped && <p style={{ textAlign: 'center' }}><a href="#slip" onClick={(e) => { e.preventDefault(); setMode('slip'); setErr(null); }}>{S.adviserUseSlip}</a></p>}
      <Btn variant="ghost" onClick={onSkip} disabled={busy} style={{ width: '100%' }}>{S.joinSkipStep}</Btn>
    </Card>
  );
}
