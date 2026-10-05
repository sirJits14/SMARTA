import { createContext, useContext, Children, cloneElement, isValidElement, useId, useRef, useState } from 'react';
import DialogFrame from './DialogFrame.jsx';
import { MARK_LABEL } from '../lib/constants.js';
import { T, MARK_COLOR } from '../styles.js';
const font = { fontFamily: T.body };

export const Btn = ({ style, className = '', variant = 'solid', ...p }) => (
  <button {...p} className={`sims-btn ${className}`} style={{ ...font, cursor: 'pointer', borderRadius: T.pill, padding: '10px 20px',
    fontWeight: 600, fontSize: 'var(--sims-field-font, 13px)',
    background: variant === 'solid' ? T.primary : 'transparent',
    color: variant === 'solid' ? '#fff' : T.primary,
    border: variant === 'solid' ? 'none' : `1.5px solid ${T.primary}`,
    transition: 'background 0.15s ease-out, opacity 0.15s ease-out',
    ...style }} />
);
export const Inp = ({ style, className = '', ...p }) => (
  <input {...p} className={`sims-input ${className}`} style={{ ...font, border: `1.5px solid var(--sims-control-border, ${T.border})`, borderRadius: 'var(--sims-field-radius, 10px)',
    background: T.surface, padding: '10px 14px', fontSize: 'var(--sims-field-font, 13px)', width: '100%', boxSizing: 'border-box',
    color: T.ink, transition: 'border-color 0.15s ease-out', ...style }}
    onFocus={(e) => { e.target.style.borderColor = T.primary; p.onFocus?.(e); }}
    onBlur={(e) => { e.target.style.borderColor = `var(--sims-control-border, ${T.border})`; p.onBlur?.(e); }}
  />
);
export const Sel = ({ style, className = '', ...p }) => (
  <select {...p} className={`sims-input ${className}`} style={{ ...font, border: `1.5px solid var(--sims-control-border, ${T.border})`, borderRadius: 'var(--sims-field-radius, 10px)',
    background: T.surface, padding: '10px 14px', fontSize: 'var(--sims-field-font, 13px)', width: '100%', boxSizing: 'border-box',
    color: T.ink, transition: 'border-color 0.15s ease-out', ...style }}
    onFocus={(e) => { e.target.style.borderColor = T.primary; p.onFocus?.(e); }}
    onBlur={(e) => { e.target.style.borderColor = `var(--sims-control-border, ${T.border})`; p.onBlur?.(e); }}
  />
);
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
  return <div style={{ display:'block', marginBottom:14 }}>
    <label htmlFor={assigned ? targetId : undefined} style={{ ...font, display:'block', fontSize:12, fontWeight:600, color:T.inkMuted, marginBottom:6 }}>{label}</label>
    {content}
    {error && <span id={errorId} style={{ ...font, display:'block', color:T.absent, fontSize:12, marginTop:4 }}>{error}</span>}
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
    style={{ width, maxWidth:'calc(100vw - 32px)', fontFamily:T.body }}>
    {title && <h2 id={titleId} style={{ margin:'0 0 20px', fontSize:20 }}>{title}</h2>}
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
    <p style={{ ...font, color:T.ink, fontSize:14, lineHeight:1.6 }}>{message}</p>
    {error && <p role="alert" className="sims-feedback">{error}</p>}
    <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:16 }}>
      <Btn disabled={pending} variant="ghost" onClick={onNo}>{cancelLabel}</Btn>
      <Btn disabled={pending} onClick={confirm} style={{ background:danger ? T.absent : T.primary }}>{pending ? 'Working…' : label}</Btn>
    </div>
  </Modal>;
}
export function ResourceState({ resources, children, label = 'records' }) {
  const failed = resources.filter(r => r.error);
  if (failed.length) return <Card style={{ padding:24 }}><p role="alert" className="sims-feedback">Could not load {label}. Please try again.</p><Btn onClick={() => failed.forEach(r => r.retry())}>Try again</Btn></Card>;
  if (resources.some(r => r.loading)) return <div className="sims-loading" role="status">Loading {label}…</div>;
  return children;
}
export const EmptyState = ({ title, hint }) => (
  <div style={{ ...font, textAlign: 'center', color: T.inkMuted, padding: '48px 20px' }}>
    <div style={{ fontWeight: 700, color: T.ink, marginBottom: 6 }}>{title}</div>
    <div style={{ fontSize: 13 }}>{hint}</div>
  </div>
);

// --- Signature components -------------------------------------------------

export const Card = ({ as: Tag = 'div', surface = 'working', className = '', style, children, ...p }) => (
  <Tag {...p} className={`sims-surface sims-surface--${surface} ${className}`} style={{ background: 'var(--sims-surface-fill, #fff)', border: `1px solid var(--sims-surface-border, ${T.border})`, borderRadius: 'var(--sims-radius, 14px)',
    boxShadow: `var(--sims-surface-shadow, ${T.cardShadow})`, ...style }}>{children}</Tag>
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
        borderRadius: T.pill, background: MARK_COLOR[mark], color: '#fff',
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
    {action.busy && <p role="status" style={{fontSize:13,color:T.inkMuted}}>Saving changes…</p>}</>;
}
