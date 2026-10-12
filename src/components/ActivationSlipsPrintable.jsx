import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { chunkSlips, activationUrl, formatCodeForPrint, slipInstructions, slipPrintStyles } from '../lib/slipLayout.js';

// The QR is generated at 200px and shown at 26mm so it stays sharp on paper.
function Slip({ slip, portalUrl }) {
  const [qr, setQr] = useState(null);
  const url = activationUrl(portalUrl, slip.code);
  useEffect(() => { let on = true; QRCode.toDataURL(url, { margin: 0, width: 200 }).then((u) => on && setQr(u)).catch(() => {}); return () => { on = false; }; }, [url]);
  return (
    <div className="slip">
      {qr ? <img className="slip-qr" src={qr} alt="" /> : <div className="slip-qr" />}
      <div className="slip-text">
        <div className="slip-name">{slip.name}</div>
        <div className="slip-meta">{slip.sectionLabel} · LRN {slip.lrn}</div>
        <div className="slip-code">{formatCodeForPrint(slip.code)}</div>
        <div className="slip-note">{slipInstructions(portalUrl, slip.schoolYear)}</div>
      </div>
    </div>
  );
}

export default function ActivationSlipsPrintable({ slips, portalUrl, paper }) {
  const sheets = useMemo(() => chunkSlips(slips, paper), [slips, paper]);
  return (
    <div className="slips-print-root paper">
      <style>{slipPrintStyles(paper)}</style>
      {sheets.map((sheet, i) => <div className="slips-sheet" key={i}>{sheet.map((s) => <Slip key={s.studentId} slip={s} portalUrl={portalUrl} />)}</div>)}
    </div>
  );
}
