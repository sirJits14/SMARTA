import { MARK_LABEL } from '../lib/constants.js';
import { T, MARK_COLOR } from '../styles.js';
const font = { fontFamily: T.body };

export const Btn = ({ style, variant = 'solid', ...p }) => (
  <button {...p} style={{ ...font, cursor: 'pointer', borderRadius: T.pill, padding: '10px 20px',
    fontWeight: 600, fontSize: 13,
    background: variant === 'solid' ? T.primary : 'transparent',
    color: variant === 'solid' ? '#fff' : T.primary,
    border: variant === 'solid' ? 'none' : `1.5px solid ${T.primary}`,
    transition: 'background 0.15s ease-out, opacity 0.15s ease-out',
    ...style }} />
);
export const Inp = ({ style, ...p }) => (
  <input {...p} style={{ ...font, outline: 'none', border: `1.5px solid ${T.border}`, borderRadius: 10,
    background: T.surface, padding: '10px 14px', fontSize: 13, width: '100%', boxSizing: 'border-box',
    color: T.ink, transition: 'border-color 0.15s ease-out', ...style }}
    onFocus={(e) => { e.target.style.borderColor = T.primary; p.onFocus?.(e); }}
    onBlur={(e) => { e.target.style.borderColor = T.border; p.onBlur?.(e); }}
  />
);
export const Sel = ({ style, ...p }) => (
  <select {...p} style={{ ...font, outline: 'none', border: `1.5px solid ${T.border}`, borderRadius: 10,
    background: T.surface, padding: '10px 14px', fontSize: 13, width: '100%', boxSizing: 'border-box',
    color: T.ink, transition: 'border-color 0.15s ease-out', ...style }}
    onFocus={(e) => { e.target.style.borderColor = T.primary; p.onFocus?.(e); }}
    onBlur={(e) => { e.target.style.borderColor = T.border; p.onBlur?.(e); }}
  />
);
export const Field = ({ label, error, children }) => (
  <label style={{ display: 'block', marginBottom: 14 }}>
    <span style={{ ...font, display: 'block', fontSize: 12, fontWeight: 600, color: T.inkMuted, marginBottom: 6 }}>{label}</span>
    {children}
    {error && <span style={{ ...font, display: 'block', color: T.absent, fontSize: 11, marginTop: 4 }}>{error}</span>}
  </label>
);
export const Modal = ({ children, onClose, width = 520 }) => (
  <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(30,27,51,0.45)',
    display: 'grid', placeItems: 'center', zIndex: 50 }}>
    <div onClick={(e) => e.stopPropagation()} style={{ background: T.surface, borderRadius: T.radius, padding: 24,
      width, maxWidth: '92vw', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 50px rgba(30,27,51,0.25)' }}>{children}</div>
  </div>
);
export const Confirm = ({ message, onYes, onNo, label = 'Delete', danger = true }) => (
  <Modal onClose={onNo}>
    <p style={{ ...font, color: T.ink, fontSize: 14 }}>{message}</p>
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
      <Btn variant="ghost" onClick={onNo}>Keep it</Btn>
      <Btn onClick={onYes} style={{ background: danger ? T.absent : T.primary }}>{label}</Btn>
    </div>
  </Modal>
);
export const EmptyState = ({ title, hint }) => (
  <div style={{ ...font, textAlign: 'center', color: T.inkMuted, padding: '48px 20px' }}>
    <div style={{ fontWeight: 700, color: T.ink, marginBottom: 6 }}>{title}</div>
    <div style={{ fontSize: 13 }}>{hint}</div>
  </div>
);

// --- Signature components -------------------------------------------------

export const Card = ({ as: Tag = 'div', style, children, ...p }) => (
  <Tag {...p} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius,
    boxShadow: T.cardShadow, ...style }}>{children}</Tag>
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
