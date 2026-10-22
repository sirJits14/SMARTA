import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

// A bottom sheet over the page. Portalled to <body> so no ancestor's transform or filter can trap the
// fixed overlay (see FlagSheet and ScanSheet). Escape and a tap outside close it unless `busy`; focus
// goes to the first enabled control and returns to whatever opened the sheet.
export default function Sheet({ title, hint, busy = false, onClose, children }) {
  const dialog = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const opener = document.activeElement;
    dialog.current?.querySelector('input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)')?.focus();
    return () => { if (opener instanceof HTMLElement) opener.focus(); };
  }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);
  return createPortal(
    <div className="flag-sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={dialog} className="flag-sheet class-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <span className="flag-sheet-grip" aria-hidden="true" />
        <h2 id={titleId}>{title}</h2>
        {hint && <p className="flag-sheet-hint">{hint}</p>}
        {children}
      </div>
    </div>,
    document.body,
  );
}
