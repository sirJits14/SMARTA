import { useRef } from 'react';
import { T, S } from '../../styles.js';
import { Btn, Card } from '../../components/ui.jsx';
import SlipPrintControls, { useSlipPaper, PORTAL_URL } from '../../components/SlipPrintControls.jsx';
import AdvisorySlipsPrintable from '../../components/AdvisorySlipsPrintable.jsx';
import { usePrintReadiness } from '../../hooks/usePrintReadiness.js';
import { issuedText } from '../../lib/advisoryStatus.js';

// Raw codes live only here after issuing; closing the panel loses them.
export default function AdvisorySlipsPanel({ result, onClose }) {
  const [paper, setPaper] = useSlipPaper();
  const printRoot = useRef(null);
  const printReady = usePrintReadiness(printRoot, result, result.issued.length);
  return (
    <>
      <Card className="advisory-controls" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={S.h2}>Advisory slips</h2>
          <Btn variant="ghost" onClick={onClose}>Close</Btn>
        </div>
        <p role="status" style={{ fontFamily: T.body, fontSize: 13, color: T.inkMuted }}>
          {issuedText(result)} Print them now: the codes are shown only once. Each slip works once, for a teacher signed in with a DepEd email.
        </p>
        {result.issued.length > 0 && <SlipPrintControls paper={paper} onPaperChange={setPaper} printReady={printReady} />}
      </Card>
      {result.issued.length > 0 && <div ref={printRoot}><AdvisorySlipsPrintable slips={result.issued} portalUrl={PORTAL_URL} paper={paper} /></div>}
    </>
  );
}
