import { createContext, useContext, useEffect, Children, cloneElement, isValidElement, useId, useRef, useState } from 'react';
import DialogFrame from './DialogFrame.jsx';
import NavIcon from './NavIcon.jsx';
import { MARK_LABEL } from '../lib/constants.js';
import { T, MARK_COLOR } from '../styles.js';

// Button variants: solid = primary action, ghost = secondary (bordered),
// danger = destructive, ghost-danger = bordered with red text (less final destructive steps),
// quiet = text-only, icon = square icon button (needs aria-label).
// Hover, focus, active, disabled and loading states live in registrar.css.
const BTN_VARIANT = { solid: 'primary', ghost: 'secondary', 'ghost-danger': 'secondary is-danger', danger: 'danger', quiet: 'quiet', icon: 'icon' };
export const Btn = ({ className = '', variant = 'solid', loading = false, disabled, children, ...p }) => (
  <button {...p} disabled={disabled || loading} aria-busy={loading || undefined}
    className={`sims-btn sims-btn--${BTN_VARIANT[variant] || 'primary'} ${className}`}>
    {loading && <span className="sims-btn-spinner" aria-hidden="true" />}{children}
  </button>
);
export const Inp = ({ className = '', ...p }) => <input {...p} className={`sims-input ${className}`} />;
export const Sel = ({ className = '', ...p }) => <select {...p} className={`sims-input sims-select ${className}`} />;
export function Field({ label, error, children }) {
  const generated = useId();
  const errorId = generated + '-error';
  let assigned = false;
  let targetId = generated;
  const attach = node => {
    if (!isValidElement(node) || assigned) return node;
    if (node.type === Inp || node.type === Sel || ['input','select','textarea'].includes(node.type)) {
      assigned = true;
      targetId = node.props.id || generated;
      return cloneElement(node, { id: targetId, 'aria-invalid': error ? true : node.props['aria-invalid'],
        'aria-describedby': [node.props['aria-describedby'], error ? errorId : null].filter(Boolean).join(' ') || undefined });
    }
    return node.props.children ? cloneElement(node, {}, Children.map(node.props.children, attach)) : node;
  };
  const content = Children.map(children, attach);
  return <div className="sims-field">
    <label htmlFor={assigned ? targetId : undefined} className="sims-field-label">{label}</label>
    {content}
    {error && <span id={errorId} className="sims-field-error">{error}</span>}
  </div>;
}

const EditorResourceContext = createContext([]);
export const EditorResources = ({resources, children}) => <EditorResourceContext.Provider value={resources}>{children}</EditorResourceContext.Provider>;

export function Modal({ children, onClose, width = 520, overlayClassName = '', title, labelledBy, dismissible = true }) {
  const titleId = useId();
  const resources = useContext(EditorResourceContext);
  const unavailable = resources.some(r => r.loading || r.error);
  return <DialogFrame label={title ? undefined : 'Dialog'} labelledBy={labelledBy || (title ? titleId : undefined)}
    onClose={onClose} dismissible={dismissible} className={overlayClassName}
    style={{ width, maxWidth:'calc(100vw - 32px)' }}>
    {title && <div className="sims-dialog-head">
      <h2 id={titleId} className="sims-dialog-title">{title}</h2>
      {dismissible && <button type="button" className="sims-btn sims-btn--icon sims-dialog-close" aria-label="Close dialog" onClick={onClose}><NavIcon name="close" size={18} /></button>}
    </div>}
    {unavailable && <><ResourceState resources={resources}/>{dismissible && <Btn variant="ghost" onClick={onClose}>Close dialog</Btn>}</>}
    <fieldset disabled={unavailable} style={{border:0,padding:0,margin:0,minWidth:0}}>{children}</fieldset>
  </DialogFrame>;
}
export function Confirm({ message, onYes, onNo, label = 'Delete', cancelLabel = 'Cancel', danger = true, title = 'Confirm action' }) {
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const confirm = async () => {
    if (lock.current) return;
    lock.current = true; setPending(true); setError('');
    try { await onYes(); }
    catch { setError('The action could not be completed. Please try again.'); }
    finally { lock.current = false; setPending(false); }
  };
  return <Modal title={title} onClose={onNo} dismissible={!pending}>
    <p className="sims-dialog-body">{message}</p>
    {error && <p role="alert" className="sims-feedback">{error}</p>}
    <div className="sims-dialog-actions">
      {/* Start on the safe choice so Enter never confirms by accident. */}
      <Btn disabled={pending} variant="ghost" onClick={onNo} autoFocus>{cancelLabel}</Btn>
      <Btn loading={pending} variant={danger ? 'danger' : 'solid'} onClick={confirm}>{pending ? 'Working…' : label}</Btn>
    </div>
  </Modal>;
}
export function ResourceState({ resources, children, label = 'records' }) {
  const failed = resources.filter(r => r.error);
  if (failed.length) return <Card style={{ padding:24 }}><p role="alert" className="sims-feedback">Could not load {label}. Please try again.</p><Btn onClick={() => failed.forEach(r => r.retry())}>Try again</Btn></Card>;
  if (resources.some(r => r.loading)) return <div className="sims-loading" role="status"><span className="sims-sr-only">Loading {label}…</span><div className="sims-skeleton" aria-hidden="true"><span /><span /><span /></div></div>;
  return children;
}
export const EmptyState = ({ title, hint }) => (
  <div className="sims-empty">
    <div className="sims-empty-title">{title}</div>
    <div className="sims-empty-hint">{hint}</div>
  </div>
);

// A count that reads as a number on screen and as a phrase to screen readers.
export const CountBadge = ({ count, label }) => (
  <span className="sims-count-badge"><span aria-hidden="true">{count}</span><span className="sims-sr-only">{`${count} ${label}`}</span></span>
);

// Subtle status label. tone: success | warning | danger | info | accent | neutral.
export const Badge = ({ tone = 'neutral', children }) => <span className={`sims-badge sims-badge--${tone}`}>{children}</span>;

// Row actions: a ⋯ button that opens a menu of secondary actions. The menu is
// fixed-positioned so table scroll containers never clip it, flips above the
// button near the bottom of the window, and supports arrow keys, Home/End and
// Escape. Items stay mounted (hidden) so server-rendered markup still lists them.
// items: [{ label, onSelect, danger, disabled }] (falsy entries are skipped).
export function RowMenu({ label, items }) {
  const shown = items.filter(Boolean);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();
  const enabled = () => [...(menuRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') ?? [])];
  useEffect(() => {
    if (!open) return undefined;
    const box = buttonRef.current.getBoundingClientRect();
    const height = menuRef.current?.offsetHeight || 0;
    const below = box.bottom + 4 + height <= window.innerHeight - 8;
    setPos({ top: below ? box.bottom + 4 : Math.max(8, box.top - 4 - height), right: Math.max(8, window.innerWidth - box.right) });
    const away = (event) => { if (!menuRef.current?.contains(event.target) && !buttonRef.current?.contains(event.target)) setOpen(false); };
    const close = (event) => { if (!menuRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => { document.removeEventListener('pointerdown', away); window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true); };
  }, [open]);
  // Focus the first item once the menu is placed (an invisible element cannot take focus).
  useEffect(() => { if (open && pos) enabled()[0]?.focus({ preventScroll: true }); }, [open, pos]);
  if (!shown.length) return null;
  const onKeyDown = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); buttonRef.current?.focus(); return; }
    if (event.key === 'Tab') { setOpen(false); return; }
    const list = enabled();
    const at = list.indexOf(document.activeElement);
    const next = event.key === 'ArrowDown' ? (at + 1) % list.length : event.key === 'ArrowUp' ? (at - 1 + list.length) % list.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : -1;
    if (next >= 0 && list.length) { event.preventDefault(); list[next].focus({ preventScroll: true }); }
  };
  // Row clicks open details on some tables; the menu's clicks and keys are its own.
  return <span className="sims-row-menu-wrap" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
    <button ref={buttonRef} type="button" className="sims-btn sims-btn--icon sims-row-menu-button" aria-label={label} title={label}
      aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} onClick={() => { setPos(null); setOpen((o) => !o); }}>
      <NavIcon name="more" size={18} />
    </button>
    <div id={menuId} ref={menuRef} role="menu" aria-label={label} hidden={!open} className="sims-menu sims-row-menu"
      style={pos ? { top: pos.top, right: pos.right } : { visibility: 'hidden' }} onKeyDown={onKeyDown}>
      {shown.map((item) => <button key={item.label} type="button" role="menuitem" tabIndex={-1} disabled={item.disabled}
        className={`sims-menu-item ${item.danger ? 'is-danger' : ''}`} title={item.hint}
        onClick={() => { buttonRef.current?.focus(); setOpen(false); item.onSelect(); }}>{item.label}</button>)}
    </div>
  </span>;
}

// --- Signature components -------------------------------------------------

// Flat bordered surface. `surface` (working / summary / navigation) is kept as a
// modifier class for layout hooks; every surface shares one material.
export const Card = ({ as: Tag = 'div', surface = 'working', className = '', children, ...p }) => (
  <Tag {...p} className={`sims-surface sims-surface--${surface} ${className}`}>{children}</Tag>
);

// StatusPill: the attendance/status control. Renders as a real <button> when
// it is its own interactive unit (pass onClick); renders as a plain <div>
// (decorative, aria-hidden) when it sits inside an already-interactive row
// so we never nest two interactive elements — the row keeps the click/
// keyboard handling. Replaces the retired Card File "GuideTab" trapezoid.
export const StatusPill = ({ mark, onClick }) => {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      aria-hidden={onClick ? undefined : true}
      aria-label={onClick ? `Attendance mark: ${MARK_LABEL[mark]}. Activate to change.` : undefined}
      style={{
        fontFamily: T.body, cursor: onClick ? 'pointer' : 'default', border: 'none',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        borderRadius: T.pill, background: MARK_COLOR[mark], color: T.onStatus,
        fontWeight: 600, fontSize: 12, padding: '5px 14px',
        transition: 'background 0.15s ease-out',
      }}
    >
      {MARK_LABEL[mark]}
    </Tag>
  );
};

export function ActionFeedback({ action }) {
  const message = Object.values(action.errors)[0];
  return <>{message && <p role="alert" className="sims-feedback">{message}</p>}
    {action.busy && <p role="status" className="sims-saving">Saving changes…</p>}</>;
}
