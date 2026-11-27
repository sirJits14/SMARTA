// Temporary ID passes print at CR80 size (54 × 85.6 mm), three across and
// three down on A4: 170 × 264.8 mm with the gaps, inside the 194 × 281 mm
// printable area, so a sheet never spills onto a second page.
export const TEMP_PASS_PRINT_STYLES = `
  .temp-pass-sheets { display: flex; flex-wrap: wrap; gap: 12px; }
  .temp-pass-sheet { display: contents; }
  .temp-pass-sheet .temp-pass-card { display: block; width: 200px; height: auto; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18); }
  @media print {
    @page { size: A4; margin: 8mm }
    .app-sidebar, .app-topbar, .id-cards-controls, .id-cards-heading { display: none !important; }
    .app-shell { grid-template-columns: 1fr !important; height: auto !important; overflow: visible !important; }
    main { padding: 0 !important; overflow: visible !important; }
    .temp-pass-sheets { display: block !important; }
    .temp-pass-sheet {
      display: grid !important;
      grid-template-columns: repeat(3, 54mm);
      grid-auto-rows: 85.6mm;
      gap: 4mm;
      justify-content: center;
    }
    .temp-pass-sheet:not(:last-child) { break-after: page; }
    .temp-pass-sheet .temp-pass-card {
      width: 54mm;
      height: 85.6mm;
      outline: 0.2mm dashed #999;
      /* Drawn inside the card: an outline above the first row would otherwise
         spill onto the foot of the previous page. */
      outline-offset: -0.2mm;
      box-shadow: none;
      break-inside: avoid;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
  }
`;
