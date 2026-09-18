import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { fullName } from '../lib/roster.js';
import { T } from '../styles.js';
import { ID_CARD_PRINT_STYLES, chunkIdCardsIntoSheets } from '../pages/idCardPrintLayout.js';

const sectionLabel = (s) => s ? `Grade ${s.gradeLevel} - ${s.name}${s.strand ? ` · ${s.strand}` : ''}` : '—';

function IdCard({ student, section }) {
  const [qrSrc, setQrSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(student.lrn)
      .then((url) => { if (!cancelled) setQrSrc(url); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [student.lrn]);

  return (
    <div className="id-card" style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: 16, textAlign: 'center', boxShadow: T.cardShadow }}>
      {qrSrc ? (
        <img className="id-card-qr" src={qrSrc} alt={`QR code for LRN ${student.lrn}`} width={140} height={140} style={{ display: 'block', margin: '0 auto 10px' }} />
      ) : failed ? (
        <div className="id-card-qr" style={{ width: 140, height: 140, margin: '0 auto 10px', display: 'grid', placeItems: 'center', border: `1px dashed ${T.border}`, borderRadius: 8 }}>
          <span style={{ ...T.num, fontSize: 11, color: T.inkMuted }}>QR unavailable</span>
        </div>
      ) : (
        <div className="id-card-qr" style={{ width: 140, height: 140, margin: '0 auto 10px' }} />
      )}
      <div className="id-card-name" style={{ fontFamily: T.body, fontWeight: 700, fontSize: 13, color: T.ink }}>{fullName(student)}</div>
      <div className="id-card-lrn" style={{ ...T.num, fontSize: 12, color: T.inkMuted, marginTop: 2 }}>{student.lrn}</div>
      <div className="id-card-section" style={{ fontFamily: T.body, fontSize: 11, color: T.inkMuted, marginTop: 2 }}>{sectionLabel(section)}</div>
    </div>
  );
}

export default function IdCardsPrintSheets({ roster, section, printOnly = false }) {
  const sheets = useMemo(() => chunkIdCardsIntoSheets(roster), [roster]);
  const gridClassName = printOnly ? 'id-cards-grid id-cards-print-only' : 'id-cards-grid';

  return (
    <>
      <style>{ID_CARD_PRINT_STYLES}</style>
      <div className={gridClassName} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
        {sheets.map((sheet, i) => (
          <div className="id-cards-sheet" key={i}>
            {sheet.map((s) => <IdCard key={s.id} student={s} section={section} />)}
          </div>
        ))}
      </div>
    </>
  );
}
