import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { chunkSlips, formatCodeForPrint } from '../lib/slipLayout.js';
import { advisoryUrl, advisoryInstructions, advisoryPrintStyles } from '../lib/advisorySlipLayout.js';

// The QR is generated at 200px and shown at 26mm so it stays sharp on paper.
function AdvisorySlip({ slip, portalUrl }) {
  const [qr, setQr] = useState(null);
  const url = advisoryUrl(portalUrl, slip.code);
  useEffect(() => { let on = true; QRCode.toDataURL(url, { margin: 0, width: 200 }).then((u) => on && setQr(u)).catch(() => {}); return () => { on = false; }; }, [url]);
  return (
    <div className="slip advisory-slip">
      <div className="advisory-band">ADVISORY SLIP · CLASS ADVISER</div>
      {qr ? <img className="slip-qr" src={qr} alt="" /> : <div className="slip-qr" />}
      <div className="slip-text">
        <div className="advisory-section">{slip.sectionLabel}</div>
        <div className="slip-meta">SY {slip.schoolYear}</div>
        <div className="slip-code">{formatCodeForPrint(slip.code)}</div>
        <div className="slip-note">{advisoryInstructions(slip.schoolYear)}</div>
      </div>
    </div>
  );
}

export default function AdvisorySlipsPrintable({ slips, portalUrl, paper }) {
  const sheets = useMemo(() => chunkSlips(slips, paper), [slips, paper]);
  return (
    <div className="slips-print-root paper">
      <style>{advisoryPrintStyles(paper)}</style>
      {sheets.map((sheet, i) => <div className="slips-sheet" key={i}>{sheet.map((s) => <AdvisorySlip key={s.sectionId} slip={s} portalUrl={portalUrl} />)}</div>)}
    </div>
  );
}
