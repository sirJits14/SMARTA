import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import S from '../strings.js';
import { T } from '../styles.js';
import { Btn } from './ui.jsx';

// Bottom sheet for a learner's session attendance. Portalled to <body> so no
// ancestor transform or filter can trap the fixed overlay (see ScanSheet).
export default function SessionSheet({ onClose, children }) {
  const dialog = useRef(null);
  // Focus moves into the sheet on open and back to the Sessions button on close.
  useEffect(() => {
    const opener = document.activeElement;
    dialog.current?.focus();
    return () => { if (opener instanceof HTMLElement) opener.focus(); };
  }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.45)', display: 'grid', alignItems: 'end', justifyItems: 'center' }}>
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="session-sheet-title"
        style={{ width: 'min(100%, 480px)', boxSizing: 'border-box', maxHeight: '85dvh', overflowY: 'auto', background: T.surface, color: T.ink, fontFamily: T.font,
          borderRadius: `${T.radius}px ${T.radius}px 0 0`, padding: '16px 16px calc(16px + env(safe-area-inset-bottom, 0px))', outline: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <h2 id="session-sheet-title" style={{ fontSize: 18, margin: 0 }}>{S.sessionTitle}</h2>
          <Btn variant="ghost" onClick={onClose} style={{ padding: '6px 16px' }}>{S.sessionClose}</Btn>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
