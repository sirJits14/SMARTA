const columns = 8;
const rows = 10;
// Row height is intentionally shy of an even split of the 281mm printable
// height (297mm A4 minus the 8mm top/bottom @page margins): a block sized to
// *exactly* fill the printable area gives print engines zero rounding
// tolerance, which reliably produces a spurious blank trailing page. A full
// 10-row sheet at this height (270mm + 9 gaps of 1mm = 279mm) leaves a 2mm
// buffer. Rows are sized with grid-auto-rows rather than a fixed sheet
// height so a roster that doesn't fill a whole sheet only reserves the rows
// it actually uses, instead of always claiming the full page height.
const ROW_HEIGHT_MM = 27;

export const ID_CARD_PRINT_LAYOUT = Object.freeze({
  columns,
  rows,
  cardsPerSheet: columns * rows,
});

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
      gap: 1mm;
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
      border-radius: 0 !important;
      box-shadow: none !important;
    }
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
  }
`;
