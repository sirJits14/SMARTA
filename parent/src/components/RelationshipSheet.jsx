import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import S from '../strings.js';
import { T } from '../styles.js';
import { Btn, Banner } from './ui.jsx';
import { ADVISER, relationshipOptions, changeErrorMessage } from '../lib/relationships.js';

// Lazy-loaded from History (keeps the eager bundle small). Portalled to
// <body> so no .glass-card backdrop-filter traps the fixed overlay (see ScanSheet).
export default function RelationshipSheet({ link, onSave, onClose }) {
  const [choice, setChoice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const options = relationshipOptions(link.slot);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const save = async () => {
    if (!choice || busy) return;
    setBusy(true); setErr(null);
    try { await onSave(choice); onClose(); } catch (e) { setErr(changeErrorMessage(e)); setBusy(false); }
  };

  return createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.45)', display: 'grid', alignItems: 'end', justifyItems: 'center' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="rel-sheet-title"
        style={{ width: 'min(100%, 480px)', boxSizing: 'border-box', background: T.surface, color: T.ink, fontFamily: T.font, borderRadius: `${T.radius}px ${T.radius}px 0 0`, padding: 16 }}>
        <h2 id="rel-sheet-title" style={{ fontSize: 18, margin: '0 0 12px' }}>{S.relSheetTitle}</h2>
        {err && <Banner tone="danger">{err}</Banner>}
        <div role="radiogroup" aria-labelledby="rel-sheet-title" style={{ display: 'grid', gap: 2 }}>
          {options.map((r) => (
            <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: T.tap, fontSize: 16, cursor: 'pointer' }}>
              <input type="radio" name="relationship" value={r} checked={choice === r} disabled={busy} onChange={() => setChoice(r)} />
              {r === ADVISER ? S.activateAdviserOption : r}
            </label>
          ))}
        </div>
        <p style={{ fontSize: 13, color: T.inkMuted, margin: '12px 0' }}>{S.relOnceNote}</p>
        <div style={{ display: 'grid', gap: 10 }}>
          <Btn onClick={save} disabled={!choice || busy}>{S.relConfirm}</Btn>
          <Btn variant="ghost" onClick={onClose} disabled={busy}>{S.cancel}</Btn>
        </div>
      </div>
    </div>,
    document.body,
  );
}
