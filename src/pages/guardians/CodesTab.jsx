import { usePrintReadiness } from '../../hooks/usePrintReadiness.js';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { ActionFeedback } from '../../components/ui.jsx';
import { ResourceState } from '../../components/ui.jsx';
import { useMemo, useRef, useState } from 'react';
import { useCollectionResource } from '../../hooks/useCollection.js';
import { call } from '../../data/guardians.js';
import { T, S } from '../../styles.js';
import { Btn, Card, EmptyState } from '../../components/ui.jsx';
import ActivationSlipsPrintable from '../../components/ActivationSlipsPrintable.jsx';
import SectionPicker from '../../components/SectionPicker.jsx';
import EndSchoolYearCard from './EndSchoolYearCard.jsx';

const PORTAL_URL = import.meta.env.VITE_PARENT_PORTAL_URL || 'https://bnhs-parent.web.app';

// Raw codes exist only in this component's state after issuing. Closing the
// page loses them; the registrar reissues (which revokes the old codes).
export default function CodesTab({ schoolYear }) {
  const action = useAsyncAction();
  const sectionsResource = useCollectionResource('sections');
  const sections = sectionsResource.data;
  const sectionsSY = useMemo(() => sections.filter((s) => s.schoolYear === schoolYear).sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name)), [sections, schoolYear]);
  const [sectionId, setSectionId] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [result, setResult] = useState(null);
  const printRoot = useRef(null);
  const printReady = usePrintReadiness(printRoot, result, result?.slips?.length || 0);

  const issue = async () => {
    if (!window.confirm('Issue new activation slips for this section? Any previously printed slips for these learners stop working.')) return;
    setBusy(true); setErr('');
    try { setResult(await call.issueActivationCodes({ sectionId, schoolYear })); }
    catch (e) { setErr(e.message || 'Could not issue codes.'); }
    setBusy(false);
  };

  if ([sectionsResource].some(r => r.loading || r.error)) return <ResourceState resources={[sectionsResource]}/>;

  return (
    <>
      <ActionFeedback action={action}/>
      <Card className="codes-tab-controls" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={S.h2}>Issue activation slips</h2>
        <p style={{ fontFamily: T.body, fontSize: 13, color: T.inkMuted }}>One slip per enrolled learner. Print them right away — codes are shown only once. Slips work for the whole school year until you end it below. Hand them to parents in person (adviser/homeroom). Learners flagged "restricted" are skipped.</p>
        {err && <div style={{ color: T.absent, fontSize: 12, marginBottom: 8 }}>{err}</div>}
        <SectionPicker sections={sectionsSY} value={sectionId} disabled={busy || action.busy} label="Section" onChange={(id) => { setSectionId(id); setResult(null); }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', margin: '16px 0 14px' }}>
          <Btn onClick={() => action.run('issue', issue)} disabled={action.busy || busy || !sectionId}>{busy ? 'Issuing…' : 'Issue slips'}</Btn>
          <Btn variant="ghost" onClick={() => window.print()} disabled={!printReady}>Print</Btn>
        </div>
        {result && <div style={{ fontFamily: T.body, fontSize: 13 }}>{result.slips.length} slips issued{result.skipped.length ? `, ${result.skipped.length} skipped (${result.skipped.map((s) => s.reason).join(', ')})` : ''}.</div>}
      </Card>
      <EndSchoolYearCard schoolYear={schoolYear} />
      {result?.slips?.length ? <div ref={printRoot}><ActivationSlipsPrintable slips={result.slips} portalUrl={PORTAL_URL} /></div> : <EmptyState title="No slips issued yet" hint="Choose a section and issue slips to print them." />}
    </>
  );
}
