import { useState } from 'react';
import { T } from '../styles.js';
import { Btn } from './ui.jsx';
import { PAPER_SIZES, PAPER_STORAGE_KEY, readStoredPaper } from '../lib/slipLayout.js';

export const PORTAL_URL = import.meta.env.VITE_PARENT_PORTAL_URL || 'https://bnhs-parent.web.app';

// The paper choice is remembered per browser.
export function useSlipPaper() {
  const [paper, setPaperState] = useState(() => readStoredPaper());
  const setPaper = (next) => {
    setPaperState(next);
    try { localStorage.setItem(PAPER_STORAGE_KEY, next); } catch { /* the paper still switches without storage */ }
  };
  return [paper, setPaper];
}

// Paper toggle, Print button and print-dialog hint, shared by the Codes tab
// (a section's slips) and the Links tab (one reissued slip). `children`
// sit just before Print, e.g. the Issue slips button.
export default function SlipPrintControls({ paper, onPaperChange, printReady, children }) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '16px 0 6px' }}>
        <div role="group" aria-label="Paper" style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 'auto' }}>
          <span style={{ fontFamily: T.body, fontSize: 13, color: T.inkMuted }}>Paper</span>
          {Object.values(PAPER_SIZES).map((p) => (
            <Btn key={p.key} variant={paper === p.key ? 'solid' : 'ghost'} aria-pressed={paper === p.key} onClick={() => onPaperChange(p.key)} style={{ padding: '6px 14px' }}>
              {p.label} · {p.cols * p.rows}/sheet
            </Btn>
          ))}
        </div>
        {children}
        <Btn variant="ghost" onClick={() => window.print()} disabled={!printReady}>Print</Btn>
      </div>
      <p style={{ fontFamily: T.body, fontSize: 12, color: T.inkMuted, margin: '0 0 14px' }}>
        In the print dialog, set Paper size to {paper === 'a4' ? 'A4' : 'Folio / 8.5×13'} and Scale to 100%.
      </p>
    </>
  );
}
