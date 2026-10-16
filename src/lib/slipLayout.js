// Slips are the same size on every paper (2 columns × SLIP_ROW_MM rows);
// only the number of rows per sheet changes. Rows stay a little shy of the
// printable height for the same reason as src/pages/idCardPrintLayout.js:
// an exact fit gives print engines no rounding tolerance and produces a
// blank trailing page. Folio: 8 × 39 = 312mm of 314.2mm. A4: 7 × 39 = 273mm of 281mm.
export const SLIP_ROW_MM = 39;
export const DEFAULT_PAPER = 'folio';
export const PAPER_STORAGE_KEY = 'sims.slips.paper';

export const PAPER_SIZES = Object.freeze({
  folio: Object.freeze({ key: 'folio', label: 'Folio', pageSize: '8.5in 13in', marginMm: 8, heightMm: 330.2, cols: 2, rows: 8 }),
  a4: Object.freeze({ key: 'a4', label: 'A4', pageSize: 'A4 portrait', marginMm: 8, heightMm: 297, cols: 2, rows: 7 }),
});

export const paperOf = (key) => (Object.prototype.hasOwnProperty.call(PAPER_SIZES, key ?? '') ? PAPER_SIZES[key] : PAPER_SIZES[DEFAULT_PAPER]); // not Object.hasOwn: iOS < 15.4 lacks it

// Reading localStorage can itself throw (blocked site data), so the default
// is resolved inside the try.
export function readStoredPaper(storage) {
  try { return paperOf((storage === undefined ? globalThis.localStorage : storage)?.getItem(PAPER_STORAGE_KEY)).key; }
  catch { return DEFAULT_PAPER; }
}

export function chunkSlips(slips, paperKey = DEFAULT_PAPER) {
  const { cols, rows } = paperOf(paperKey);
  const perSheet = cols * rows;
  const out = [];
  for (let i = 0; i < slips.length; i += perSheet) out.push(slips.slice(i, i + perSheet));
  return out;
}
export const activationUrl = (base, code) => `${base.replace(/\/+$/, '')}/activate?c=${code}`;
export const formatCodeForPrint = (code) => `${code.slice(0, 4)}-${code.slice(4)}`;

// The adviser's separate slot is deliberately not mentioned here; parents
// are told about it in the parent app's consent notice.
export const slipInstructions = (portalUrl, schoolYear) =>
  `Scan the QR or enter this code at ${portalUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '')}. Valid SY ${schoolYear} · up to 2 parents/guardians. Keep this private. Activating means you agree to the school's privacy notice.`;

// Same print technique as src/pages/idCardPrintLayout.js: hide known chrome
// classes explicitly and collapse the app shell to a single column so print
// flows naturally, then break the page after every sheet but the last.
// Cut lines are shared: the sheet draws the top/left edge, each slip its
// right/bottom edge, so every line is printed once.
export function slipPrintStyles(paperKey) {
  const paper = paperOf(paperKey);
  return `
  .slips-sheet { display: grid; grid-template-columns: repeat(${paper.cols}, 1fr); grid-auto-rows: ${SLIP_ROW_MM}mm; border-top: 0.3mm dashed #999; border-left: 0.3mm dashed #999; }
  .slips-sheet + .slips-sheet { margin-top: 8mm; }
  .slip { box-sizing: border-box; min-width: 0; overflow: hidden; break-inside: avoid; border-right: 0.3mm dashed #999; border-bottom: 0.3mm dashed #999; padding: 3mm; display: grid; grid-template-columns: 26mm 1fr; gap: 3mm; align-items: center; font-family: Inter, system-ui, sans-serif; color: #12313A; }
  .slip-qr { width: 26mm; height: 26mm; display: block; }
  .slip-text { min-width: 0; }
  .slip-name { font-weight: 700; font-size: 11px; line-height: 1.15; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  .slip-meta { font-size: 8px; color: #444; line-height: 1.2; margin-top: 0.5mm; }
  .slip-code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 18px; letter-spacing: 0.12em; font-weight: 700; line-height: 1.2; margin: 0.8mm 0; }
  .slip-note { font-size: 7.5px; color: #444; line-height: 1.2; }
  @media print {
    .app-sidebar, .app-topbar, .guardians-heading, .guardians-tabs, .codes-tab-controls, .slips-print-hide { display: none !important; }
    .app-shell { grid-template-columns: 1fr !important; height: auto !important; overflow: visible !important; }
    main { padding: 0 !important; overflow: visible !important; }
    @page { size: ${paper.pageSize}; margin: ${paper.marginMm}mm; }
    .slips-sheet + .slips-sheet { margin-top: 0; }
    .slips-sheet:not(:last-child) { break-after: page; }
  }
`;
}

// How full the last sheet is for the chosen paper, so staff can top a batch
// up instead of wasting paper. Same wording as the ID Cards batch.
export function slipSheetFillLabel(n, paperKey = DEFAULT_PAPER) {
  const { cols, rows } = paperOf(paperKey);
  const perSheet = cols * rows;
  const full = Math.floor(n / perSheet);
  const rest = n % perSheet;
  const sheets = (k) => `${k} full sheet${k === 1 ? '' : 's'}`;
  if (n === 0) return '';
  if (rest === 0) return sheets(full);
  if (full === 0) return `${n} of ${perSheet} — ${perSheet - n} more fills a sheet`;
  return `${sheets(full)} + ${rest} — ${perSheet - rest} more fills the next sheet`;
}
