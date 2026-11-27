import { slipPrintStyles } from './slipLayout.js';

// Advisory slips share the learner slip grid and paper sizes but carry a solid
// header band so the two can't be confused (spec 2026-10-19).
export const advisoryUrl = (base, code) => `${base.replace(/\/+$/, '')}/activate?a=${code}`;
export const advisoryInstructions = (schoolYear) =>
  `For the class adviser only. Sign in with your DepEd email. Single use. Valid SY ${schoolYear}. Keep private.`;

export function advisoryPrintStyles(paperKey) {
  return `${slipPrintStyles(paperKey)}
  .advisory-slip { grid-template-rows: auto 1fr; padding-top: 0; }
  .advisory-band { grid-column: 1 / -1; margin: 0 -3mm; padding: 1mm 3mm; background: #12313A; color: #FFFFFF; font: 700 8px/1.2 Inter, system-ui, sans-serif; letter-spacing: 0.14em; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .advisory-section { font-weight: 800; font-size: 13px; line-height: 1.15; }
  @media print { .sections-page-chrome, .advisory-controls { display: none !important; } }
`;
}
