import { useEffect, useRef } from 'react';

export default function DialogFrame({ open = true, onClose, label, labelledBy, dismissible = true, className = '', style, children, fallbackFocus }) {
  const ref = useRef(null);
  const fallbackRef = useRef(fallbackFocus);
  fallbackRef.current = fallbackFocus;
  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    const opener = document.activeElement;
    if (!node.open) node.showModal();
    return () => {
      if (node.open) node.close();
      if (opener?.isConnected && opener.getClientRects().length) opener.focus();
      else fallbackRef.current?.()?.focus();
    };
  }, [open]);
  if (!open) return null;
  return <dialog ref={ref} className={`sims-dialog ${className}`} style={style}
    aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy}
    onCancel={event => { event.preventDefault(); if (dismissible) onClose(); }}
    onClick={event => {
      if (event.target !== ref.current || !dismissible) return;
      const box = ref.current.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
    }}>
    {children}
  </dialog>;
}
