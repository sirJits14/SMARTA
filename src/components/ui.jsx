import { T, MARK_COLOR, MARK_LABEL_SHORT } from '../styles.js';
const font = { fontFamily: T.body };

export const Btn = ({ style, variant = 'solid', ...p }) => (
  <button {...p} style={{ ...font, cursor: 'pointer', borderRadius: T.radius, padding: '9px 16px',
    fontWeight: 600, fontSize: 12, letterSpacing: '0.04em', textTransform: 'uppercase',
    background: variant === 'solid' ? T.brassDeep : 'transparent',
    color: variant === 'solid' ? '#fff' : T.ink,
    border: variant === 'solid' ? `1px solid ${T.brassDeep}` : `1px solid ${T.line}`,
    transition: 'background 0.15s ease-out, border-color 0.15s ease-out',
    ...style }} />
);
export const Inp = ({ style, ...p }) => (
  <input {...p} style={{ ...font, outline: 'none', border: 'none', borderBottom: `1px solid ${T.line}`,
    borderRadius: 0, background: 'transparent', padding: '8px 2px', fontSize: 13, width: '100%',
    boxSizing: 'border-box', color: T.ink, transition: 'border-color 0.15s ease-out',
    ...style }}
    onFocus={(e) => { e.target.style.borderBottomColor = T.brassDeep; e.target.style.borderBottomWidth = '2px'; p.onFocus?.(e); }}
    onBlur={(e) => { e.target.style.borderBottomColor = T.line; e.target.style.borderBottomWidth = '1px'; p.onBlur?.(e); }}
  />
);
export const Sel = ({ style, ...p }) => (
  <select {...p} style={{ ...font, outline: 'none', border: 'none', borderBottom: `1px solid ${T.line}`,
    borderRadius: 0, padding: '8px 2px', fontSize: 13, width: '100%', boxSizing: 'border-box',
    background: 'transparent', color: T.ink, transition: 'border-color 0.15s ease-out',
    ...style }}
    onFocus={(e) => { e.target.style.borderBottomColor = T.brassDeep; e.target.style.borderBottomWidth = '2px'; p.onFocus?.(e); }}
    onBlur={(e) => { e.target.style.borderBottomColor = T.line; e.target.style.borderBottomWidth = '1px'; p.onBlur?.(e); }}
  />
);
export const Field = ({ label, error, children }) => (
  <label style={{ display: 'block', marginBottom: 14 }}>
    <span style={{ ...font, display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
      textTransform: 'uppercase', color: T.ink, marginBottom: 5, opacity: 0.75 }}>{label}</span>
    {children}
    {error && <span style={{ ...font, display: 'block', color: T.absent, fontSize: 11, marginTop: 4 }}>{error}</span>}
  </label>
);
export const Modal = ({ children, onClose }) => (
  <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(46,33,15,0.55)',
    display: 'grid', placeItems: 'center', zIndex: 50 }}>
    <div onClick={(e) => e.stopPropagation()} style={{ background: T.manila, borderRadius: T.radius, padding: 24,
      width: 520, maxWidth: '92vw', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 8px 28px rgba(46,33,15,0.4)' }}>{children}</div>
  </div>
);
export const Confirm = ({ message, onYes, onNo, label = 'Delete', danger = true }) => (
  <Modal onClose={onNo}>
    <p style={{ ...font, color: T.ink, fontSize: 14 }}>{message}</p>
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
      <Btn variant="ghost" onClick={onNo}>Keep it</Btn>
      <Btn onClick={onYes} style={{ background: danger ? T.absent : T.brassDeep, borderColor: danger ? T.absent : T.brassDeep }}>{label}</Btn>
    </div>
  </Modal>
);
export const EmptyState = ({ title, hint }) => (
  <div style={{ ...font, textAlign: 'center', color: T.ink, opacity: 0.7, padding: '48px 20px' }}>
    <div style={{ fontWeight: 700, opacity: 1, marginBottom: 6 }}>{title}</div>
    <div style={{ fontSize: 13 }}>{hint}</div>
  </div>
);

// --- Signature components -------------------------------------------------

// Card: the filed index-card surface. Every row/panel of real content lives here.
export const Card = ({ style, children, ...p }) => (
  <div {...p} style={{ background: T.manila, border: `1px solid ${T.line}`, borderRadius: T.radius,
    boxShadow: T.cardShadow, ...style }}>{children}</div>
);

// GuideTab: the attendance/status control. A trapezoidal notch, never a
// border-strip or a dot/pill — see DESIGN.md "The Tabs-Not-Dots Rule".
// Renders as a real <button> when it is its own interactive unit (pass
// onClick); renders as a plain <div> (decorative, aria-hidden) when it sits
// inside an already-interactive row so we never nest two interactive
// elements — the row keeps the click/keyboard handling.
export const GuideTab = ({ mark, onClick, size = 'md' }) => {
  const dims = size === 'sm' ? { w: 44, h: 26, fs: 10 } : { w: 58, h: 34, fs: 11 };
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      aria-hidden={onClick ? undefined : true}
      aria-label={onClick ? `Attendance mark: ${MARK_LABEL_SHORT[mark]}. Activate to change.` : undefined}
      style={{
        fontFamily: T.body, cursor: onClick ? 'pointer' : 'default', border: 'none',
        width: dims.w, height: dims.h, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        clipPath: T.tabClip, background: MARK_COLOR[mark], color: '#fff',
        fontWeight: 700, fontSize: dims.fs, letterSpacing: '0.04em',
        boxShadow: T.tabShadow, transition: 'background 0.15s ease-out',
      }}
    >
      {MARK_LABEL_SHORT[mark]}
    </Tag>
  );
};
