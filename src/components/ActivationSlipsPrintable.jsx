import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { chunkSlips, activationUrl, formatCodeForPrint, SLIP_PRINT_STYLES } from '../lib/slipLayout.js';

function Slip({ slip, portalUrl }) {
  const [qr, setQr] = useState(null);
  const url = activationUrl(portalUrl, slip.code);
  useEffect(() => { let on = true; QRCode.toDataURL(url, { margin: 0, width: 96 }).then((u) => on && setQr(u)).catch(() => {}); return () => { on = false; }; }, [url]);
  return (
    <div className="slip">
      {qr ? <img src={qr} alt="" width={96} height={96} /> : <div style={{ width: 96, height: 96 }} />}
      <div>
        <div style={{ fontWeight: 700, fontSize: 12 }}>{slip.name}</div>
        <div className="slip-small">{slip.sectionLabel} · LRN {slip.lrn}</div>
        <div className="slip-code">{formatCodeForPrint(slip.code)}</div>
        <div className="slip-small">Parent/guardian: scan the QR or go to {portalUrl.replace(/^https?:\/\//, '')} and enter this code. Valid 90 days, for up to 2 guardians. Keep it private. By activating you agree to the school's privacy notice for gate-scan updates.</div>
      </div>
    </div>
  );
}

export default function ActivationSlipsPrintable({ slips, portalUrl }) {
  const sheets = useMemo(() => chunkSlips(slips), [slips]);
  return (
    <div className="slips-print-root">
      <style>{SLIP_PRINT_STYLES}</style>
      {sheets.map((sheet, i) => <div className="slips-sheet" key={i}>{sheet.map((s) => <Slip key={s.studentId} slip={s} portalUrl={portalUrl} />)}</div>)}
    </div>
  );
}
