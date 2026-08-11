const columns = 8;
const rows = 10;

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
  @media print {
    .app-sidebar, .app-topbar, .id-cards-controls, .id-cards-heading { display: none !important; }
    .app-shell { grid-template-columns: 1fr !important; height: auto !important; overflow: visible !important; }
    main { padding: 0 !important; overflow: visible !important; }
    @page { size: A4; margin: 8mm; }
    .id-cards-grid { display: block !important; }
    .id-cards-sheet {
      display: grid !important;
      grid-template-columns: repeat(${ID_CARD_PRINT_LAYOUT.columns}, 1fr);
      grid-template-rows: repeat(${ID_CARD_PRINT_LAYOUT.rows}, 1fr);
      width: 194mm;
      height: 281mm;
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
