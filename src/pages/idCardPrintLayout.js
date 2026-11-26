const columns = 8;
const rows = 10;
// Row height is intentionally shy of an even split of the 281mm printable
// height (297mm A4 minus the 8mm top/bottom @page margins): a block sized to
// *exactly* fill the printable area gives print engines zero rounding
// tolerance, which reliably produces a spurious blank trailing page. A full
// 10-row sheet at this height (270mm with no gaps) leaves an 11mm
// buffer. Rows are sized with grid-auto-rows rather than a fixed sheet
// height so a roster that doesn't fill a whole sheet only reserves the rows
// it actually uses, instead of always claiming the full page height.
const ROW_HEIGHT_MM = 27;
// Section-coded sheets (a mixed Saved batch) start with a color key that is
// as tall as its sections need, so no entry is ever clipped. A sheet that
// uses all 10 rows is held at 270mm (the same 11mm buffer as a plain sheet)
// and its card rows share whatever the key leaves; 6mm for the key is the
// usual budget, which keeps rows at 26.4mm. A shorter sheet keeps 26.4mm rows
// and simply grows, since the page has room below it.
const CODED_SHEET_HEIGHT_MM = 270;
const CODED_ROW_HEIGHT_MM = 26.4;
const CARD_FRAME_MM = 0.5;
const KEY_SWATCH_BORDER_MM = 0.8;

export const ID_CARD_PRINT_LAYOUT = Object.freeze({
  columns,
  rows,
  cardsPerSheet: columns * rows,
});

// True when a sheet's cards reach the last row, so it must stay within one page.
export const sheetUsesAllRows = (count) => count > (rows - 1) * columns;

export function chunkIdCardsIntoSheets(items) {
  const sheets = [];
  for (let index = 0; index < items.length; index += ID_CARD_PRINT_LAYOUT.cardsPerSheet) {
    sheets.push(items.slice(index, index + ID_CARD_PRINT_LAYOUT.cardsPerSheet));
  }
  return sheets;
}

export const ID_CARD_PRINT_STYLES = `
  .id-cards-sheet { display: contents; }
  .id-cards-print-only { display: none !important; }
  .id-cards-legend { display: none; }
  @media print {
    .app-sidebar, .app-topbar, .id-cards-controls, .id-cards-heading, .section-detail-modal-overlay, .sections-page-chrome { display: none !important; }
    .app-shell { grid-template-columns: 1fr !important; height: auto !important; overflow: visible !important; }
    main { padding: 0 !important; overflow: visible !important; }
    @page { size: A4; margin: 8mm; }
    .id-cards-grid { display: block !important; }
    .id-cards-print-only { display: block !important; }
    .id-cards-sheet {
      display: grid !important;
      grid-template-columns: repeat(${ID_CARD_PRINT_LAYOUT.columns}, 1fr);
      grid-auto-rows: ${ROW_HEIGHT_MM}mm;
      width: 194mm;
      gap: 0;
      overflow: hidden;
    }
    .id-cards-sheet:not(:last-child) { break-after: page; }
    .id-card {
      box-sizing: border-box !important;
      min-width: 0 !important;
      min-height: 0 !important;
      overflow: hidden !important;
      padding: 1mm !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: center !important;
      align-items: center !important;
      border: 0.5pt dashed rgba(119, 119, 119, 0.3) !important;
      border-top-width: 0 !important;
      border-left-width: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
    }
    /* Shared edges draw once; the first row/column complete each outline. */
    .id-card:nth-child(-n + ${ID_CARD_PRINT_LAYOUT.columns}) { border-top-width: 0.5pt !important; }
    .id-card:nth-child(${ID_CARD_PRINT_LAYOUT.columns}n + 1) { border-left-width: 0.5pt !important; }
    .id-card-qr {
      box-sizing: border-box !important;
      width: 16mm !important;
      height: 16mm !important;
      flex: 0 0 16mm !important;
      margin: 0 auto 0.5mm !important;
    }
    .id-card-qr span { font-size: 4pt !important; }
    .id-card-name {
      width: 100%;
      min-height: 0;
      overflow: hidden !important;
      display: -webkit-box !important;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      font-size: 5pt !important;
      line-height: 1.05 !important;
    }
    .id-card-lrn {
      font-size: 4.5pt !important;
      line-height: 1 !important;
      margin-top: 0.4mm !important;
    }
    .id-card-section { display: none !important; }

    /* Section-coded sheets: every card draws its own full dashed frame in a
       faint (30%) shade of its section color, so the seam between two cards
       is a double line and cutting between them leaves each card a complete
       frame. The key above the grid keeps the stronger, solid shade. */
    .id-cards-sheet.section-coded {
      grid-template-rows: auto;
      grid-auto-rows: ${CODED_ROW_HEIGHT_MM}mm;
    }
    .id-cards-sheet.section-coded.sheet-full {
      height: ${CODED_SHEET_HEIGHT_MM}mm;
      grid-auto-rows: minmax(0, 1fr);
    }
    .id-cards-sheet.section-coded .id-card {
      border: ${CARD_FRAME_MM}mm dashed var(--section-border) !important;
      padding: 0.6mm !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .id-cards-legend {
      grid-column: 1 / -1;
      display: flex !important;
      flex-wrap: wrap;
      align-content: flex-start;
      gap: 0.5mm 3mm;
      padding: 0.5mm 0 1mm;
      font-size: 5.5pt;
      line-height: 1.15;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .id-cards-legend-item { display: inline-flex; align-items: center; gap: 1mm; white-space: nowrap; }
    .id-cards-legend-swatch { width: 3mm; height: 2mm; border: ${KEY_SWATCH_BORDER_MM}mm solid var(--section-color); box-sizing: border-box; }
  }
`;
