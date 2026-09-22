import { useMemo, useState } from 'react';
import { useCollection } from '../../hooks/useCollection.js';
import { call } from '../../data/guardians.js';
import { T, S } from '../../styles.js';
import { Btn, Sel, Field, Card, EmptyState } from '../../components/ui.jsx';
import ActivationSlipsPrintable from '../../components/ActivationSlipsPrintable.jsx';

const PORTAL_URL = import.meta.env.VITE_PARENT_PORTAL_URL || 'https://bnhs-parent.web.app';

// Raw codes exist only in this component's state after issuing. Closing the
// page loses them; the registrar reissues (which revokes the old codes).
export default function CodesTab({ schoolYear }) {
  const sections = useCollection('sections');
  const sectionsSY = useMemo(() => sections.filter((s) => s.schoolYear === schoolYear).sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name)), [sections, schoolYear]);
  const [sectionId, setSectionId] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [result, setResult] = useState(null);

  const issue = async () => {
    if (!window.confirm('Issue new activation slips for this section? Any previously printed slips for these learners stop working.')) return;
    setBusy(true); setErr('');
    try { setResult(await call.issueActivationCodes({ sectionId, schoolYear })); }
    catch (e) { setErr(e.message || 'Could not issue codes.'); }
    setBusy(false);
  };

  return (
    <>
      <Card className="codes-tab-controls" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={S.h2}>Issue activation slips</h2>
        <p style={{ fontFamily: T.body, fontSize: 13, color: T.inkMuted }}>One slip per enrolled learner. Print them right away — codes are shown only once. Hand them to parents in person (adviser/homeroom). Learners flagged "restricted" are skipped.</p>
        {err && <div style={{ color: T.absent, fontSize: 12, marginBottom: 8 }}>{err}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'end' }}>
          <Field label="Section"><Sel value={sectionId} onChange={(e) => { setSectionId(e.target.value); setResult(null); }}><option value="">Choose a section…</option>{sectionsSY.map((s) => <option key={s.id} value={s.id}>{`${s.name} · Grade ${s.gradeLevel}${s.strand ? ` · ${s.strand}` : ''}`}</option>)}</Sel></Field>
          <Btn onClick={issue} disabled={busy || !sectionId} style={{ marginBottom: 14 }}>{busy ? 'Issuing…' : 'Issue slips'}</Btn>
          <Btn variant="ghost" onClick={() => window.print()} disabled={!result?.slips?.length} style={{ marginBottom: 14 }}>Print</Btn>
        </div>
        {result && <div style={{ fontFamily: T.body, fontSize: 13 }}>{result.slips.length} slips issued{result.skipped.length ? `, ${result.skipped.length} skipped (${result.skipped.map((s) => s.reason).join(', ')})` : ''}.</div>}
      </Card>
      {result?.slips?.length ? <ActivationSlipsPrintable slips={result.slips} portalUrl={PORTAL_URL} /> : <EmptyState title="No slips issued yet" hint="Choose a section and issue slips to print them." />}
    </>
  );
}
