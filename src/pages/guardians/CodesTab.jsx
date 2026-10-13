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
import SlipPrintControls, { useSlipPaper, PORTAL_URL } from '../../components/SlipPrintControls.jsx';
import { issuedSummary } from '../../lib/slipIssue.js';
import SectionPicker from '../../components/SectionPicker.jsx';
import EndSchoolYearCard from './EndSchoolYearCard.jsx';

// Raw codes exist only in this component's state after issuing. Closing the
// page loses them; the registrar reissues (which revokes the old codes).
export default function CodesTab({ schoolYear }) {
  const action = useAsyncAction();
  const sectionsResource = useCollectionResource('sections');
  const sections = sectionsResource.data;
  const sectionsSY = useMemo(() => sections.filter((s) => s.schoolYear === schoolYear).sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name)), [sections, schoolYear]);
  const [sectionId, setSectionId] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [result, setResult] = useState(null);
  const [paper, setPaper] = useSlipPaper();
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
        <p style={{ fontFamily: T.body, fontSize: 13, color: T.inkMuted }}>One slip per enrolled learner. Print them right away — codes are shown only once. Slips work for the whole school year until you end it below. Hand them to parents in person (adviser/homeroom). Learners flagged "restricted", and learners whose guardian and adviser slots are all linked, are skipped. To replace one lost slip, use Reissue slip on the Links tab.</p>
        {err && <div style={{ color: T.absent, fontSize: 12, marginBottom: 8 }}>{err}</div>}
        <SectionPicker sections={sectionsSY} value={sectionId} disabled={busy || action.busy} label="Section" onChange={(id) => { setSectionId(id); setResult(null); }} />
        <SlipPrintControls paper={paper} onPaperChange={setPaper} printReady={printReady}>
          <Btn onClick={() => action.run('issue', issue)} disabled={action.busy || busy || !sectionId}>{busy ? 'Issuing…' : 'Issue slips'}</Btn>
        </SlipPrintControls>
        {result && <div style={{ fontFamily: T.body, fontSize: 13 }}>{issuedSummary(result)}</div>}
      </Card>
      <EndSchoolYearCard schoolYear={schoolYear} />
      {result?.slips?.length ? <div ref={printRoot}><ActivationSlipsPrintable slips={result.slips} portalUrl={PORTAL_URL} paper={paper} /></div> : <EmptyState title="No slips issued yet" hint="Choose a section and issue slips to print them." />}
    </>
  );
}
