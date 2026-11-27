import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { fullName } from '../lib/roster.js';
import { sectionShortLabel, sectionColorMap, sectionBorderColor, sectionLegendLabel, groupBySection } from '../lib/idCardQueue.js';
import { T } from '../styles.js';
import { ID_CARD_PRINT_STYLES, chunkIdCardsIntoSheets, sheetUsesAllRows } from '../pages/idCardPrintLayout.js';

function IdCard({ student, section, color }) {
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
    <div className="id-card" style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: 16, textAlign: 'center', boxShadow: T.cardShadow, ...(color && { '--section-border': sectionBorderColor(color) }) }}>
      {qrSrc ? (
        <img className="id-card-qr" src={qrSrc} alt={`QR code for LRN ${student.lrn}`} width={140} height={140} style={{ display: 'block', margin: '0 auto 10px' }} />
      ) : failed ? (
        <div className="id-card-qr" style={{ width: 140, height: 140, margin: '0 auto 10px', display: 'grid', placeItems: 'center', border: `1px dashed ${T.border}`, borderRadius: 8 }}>
          <span style={{ fontFamily: T.print, fontVariantNumeric: 'tabular-nums', fontSize: 11, color: T.inkMuted }}>QR unavailable</span>
        </div>
      ) : (
        <div className="id-card-qr" style={{ width: 140, height: 140, margin: '0 auto 10px' }} />
      )}
      <div className="id-card-name" style={{ fontFamily: T.print, fontWeight: 700, fontSize: 13, color: T.ink }}>{fullName(student)}</div>
      <div className="id-card-lrn" style={{ fontFamily: T.print, fontVariantNumeric: 'tabular-nums', fontSize: 12, color: T.inkMuted, marginTop: 2 }}>{student.lrn}</div>
      <div className="id-card-section" style={{ fontFamily: T.print, fontSize: 11, color: T.inkMuted, marginTop: 2 }}>{sectionShortLabel(section)}</div>
    </div>
  );
}

// The color key printed above a section-coded sheet: only the sections on it.
function SheetLegend({ sheet, colors }) {
  return (
    <div className="id-cards-legend" style={{ fontFamily: T.print, color: T.ink }}>
      {groupBySection(sheet).map(({ section, entries }) => (
        <span className="id-cards-legend-item" key={section.id} style={{ '--section-color': colors.get(section.id) }}>
          <span className="id-cards-legend-swatch" aria-hidden="true" />
          {sectionLegendLabel(section)} ({entries.length})
        </span>
      ))}
    </div>
  );
}

const sheetClassName = (sectionCoded, sheet) => {
  if (!sectionCoded) return 'id-cards-sheet';
  return sheetUsesAllRows(sheet.length) ? 'id-cards-sheet section-coded sheet-full' : 'id-cards-sheet section-coded';
};

// entries: [{ student, section }] in print order. A batch may mix sections;
// sectionCoded frames each card in its section's color and adds a color key.
export default function IdCardsPrintSheets({ entries, printOnly = false, sectionCoded = false }) {
  const sheets = useMemo(() => chunkIdCardsIntoSheets(entries), [entries]);
  const colors = useMemo(() => (sectionCoded ? sectionColorMap(entries) : null), [entries, sectionCoded]);
  const gridClassName = printOnly ? 'id-cards-grid id-cards-print-only paper' : 'id-cards-grid paper';

  return (
    <>
      <style>{ID_CARD_PRINT_STYLES}</style>
      <div className={gridClassName} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
        {sheets.map((sheet, i) => (
          <div className={sheetClassName(sectionCoded, sheet)} key={i}>
            {colors && <SheetLegend sheet={sheet} colors={colors} />}
            {sheet.map(({ student, section }) => (
              <IdCard key={student.id} student={student} section={section} color={colors?.get(section.id)} />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
