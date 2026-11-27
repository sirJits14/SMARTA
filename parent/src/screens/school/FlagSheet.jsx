import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Btn, Banner, Inp } from '../../components/ui.jsx';
import { FLAG_REASONS, RESTORE_REASONS, reasonText } from '../../lib/classSession.js';

// Two taps to flag: the learner, then a reason. Portalled to <body> so no
// ancestor's transform or filter can trap the fixed overlay (see ScanSheet).
export default function FlagSheet({ rows, session, mode, busy, error, onConfirm, onClose }) {
  const [note, setNote] = useState('');
  const [other, setOther] = useState(false);
  const [otherText, setOtherText] = useState('');
  const dialog = useRef(null);
  useEffect(() => {
    const opener = document.activeElement;
    dialog.current?.querySelector('.flag-reason')?.focus();
    return () => { if (opener instanceof HTMLElement) opener.focus(); };
  }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const flagging = mode === 'flag';
  const who = rows.length === 1 ? rows[0].displayName : `${rows.length} learners`;
  return createPortal(
    <div className="flag-sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialog} className="flag-sheet" role="dialog" aria-modal="true" aria-labelledby="flag-sheet-title">
        <span className="flag-sheet-grip" aria-hidden="true" />
        <h2 id="flag-sheet-title">{who} · {session.toUpperCase()}</h2>
        <p className="flag-sheet-hint">{flagging
          ? 'Choose why. Families get a neutral update after two minutes unless you undo.'
          : 'Return to the gate-based attendance. Families get a neutral update.'}</p>
        {error && <Banner tone="danger">{error}</Banner>}
        <div className="flag-sheet-reasons">
          {(flagging ? FLAG_REASONS : RESTORE_REASONS).map((reason) => (
            <button key={reason} type="button" className="flag-reason" disabled={busy} onClick={() => onConfirm(reasonText(reason, note))}>{reason}</button>
          ))}
          <button type="button" className="flag-reason flag-reason--quiet" disabled={busy} aria-expanded={other} onClick={() => setOther((v) => !v)}>Other reason…</button>
        </div>
        {other && (
          <form className="flag-sheet-other" onSubmit={(e) => { e.preventDefault(); if (otherText.trim()) onConfirm(reasonText(otherText, note)); }}>
            <Inp autoFocus aria-label="Other reason" placeholder="Reason" maxLength={200} value={otherText} disabled={busy} onChange={(e) => setOtherText(e.target.value)} />
            <Btn type="submit" disabled={busy || !otherText.trim()}>{flagging ? 'Flag' : 'Restore'}</Btn>
          </form>
        )}
        <Inp aria-label="Note (optional)" placeholder="Note (optional)" maxLength={250} value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} />
        <Btn variant="ghost" onClick={onClose} disabled={busy} style={{ width: '100%', marginTop: 10 }}>Cancel</Btn>
      </div>
    </div>,
    document.body,
  );
}
