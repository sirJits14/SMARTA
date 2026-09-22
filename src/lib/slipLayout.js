export const SLIPS_PER_SHEET = 10; // 2 columns × 5 rows on A4 portrait

export function chunkSlips(slips, perSheet = SLIPS_PER_SHEET) {
  const out = [];
  for (let i = 0; i < slips.length; i += perSheet) out.push(slips.slice(i, i + perSheet));
  return out;
}
export const activationUrl = (base, code) => `${base.replace(/\/+$/, '')}/activate?c=${code}`;
export const formatCodeForPrint = (code) => `${code.slice(0, 4)}-${code.slice(4)}`;

// Same print technique as src/pages/idCardPrintLayout.js: hide known chrome
// classes explicitly (rather than a visibility:hidden/whitelist hack) and
// collapse the app shell to a single column so print flows naturally, then
// break the page after every sheet but the last.
export const SLIP_PRINT_STYLES = `
  .slips-sheet { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; }
  .slip { border: 1px dashed #999; border-radius: 6px; padding: 8px 10px; break-inside: avoid; display: grid; grid-template-columns: 96px 1fr; gap: 10px; align-items: center; font-family: Inter, system-ui, sans-serif; color: #1E1B33; }
  .slip-code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 20px; letter-spacing: 0.12em; font-weight: 700; }
  .slip-small { font-size: 9px; color: #444; line-height: 1.25; }
  @media print {
    .app-sidebar, .app-topbar, .guardians-heading, .guardians-tabs, .codes-tab-controls { display: none !important; }
    .app-shell { grid-template-columns: 1fr !important; height: auto !important; overflow: visible !important; }
    main { padding: 0 !important; overflow: visible !important; }
    @page { size: A4 portrait; margin: 12mm; }
    .slips-sheet:not(:last-child) { break-after: page; }
  }
`;
