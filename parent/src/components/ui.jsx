import { T } from '../styles.js';
const font = { fontFamily: T.font };

export const Btn = ({ variant = 'solid', style, ...p }) => (
  <button {...p} style={{ ...font, minHeight: T.tap, borderRadius: T.pill, padding: '10px 18px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
    background: variant === 'solid' ? T.primary : variant === 'danger' ? T.danger : 'transparent',
    color: variant === 'ghost' ? T.primary : '#fff',
    border: variant === 'ghost' ? `1.5px solid ${T.primary}` : 'none', opacity: p.disabled ? 0.6 : 1, ...style }} />
);
export const Card = ({ style, ...p }) => <section {...p} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: 16, marginBottom: 12, ...style }} />;
export const Field = ({ label, children, hint }) => (
  <label style={{ ...font, display: 'block', marginBottom: 14 }}>
    <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: T.inkMuted, marginBottom: 6 }}>{label}</span>
    {children}
    {hint && <span style={{ display: 'block', fontSize: 12, color: T.inkMuted, marginTop: 4 }}>{hint}</span>}
  </label>
);
const inputStyle = { ...font, width: '100%', boxSizing: 'border-box', minHeight: T.tap, fontSize: 16, padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${T.border}`, background: T.surface, color: T.ink };
export const Inp = (p) => <input {...p} style={{ ...inputStyle, ...p.style }} />;
export const Sel = (p) => <select {...p} style={{ ...inputStyle, ...p.style }} />;
export const Banner = ({ tone = 'info', children, action }) => (
  <div role={tone === 'danger' ? 'alert' : 'status'} style={{ ...font, fontSize: 14, borderRadius: 10, padding: '10px 12px', marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between',
    background: tone === 'danger' ? 'rgba(220,38,38,0.08)' : tone === 'warn' ? 'rgba(180,83,9,0.10)' : 'rgba(91,79,232,0.08)',
    color: tone === 'danger' ? T.danger : tone === 'warn' ? T.warn : T.primaryDeep }}>
    <span>{children}</span>{action}
  </div>
);
export const Spinner = ({ label }) => <p role="status" style={{ ...font, color: T.inkMuted, fontSize: 14 }}>{label}</p>;
export const EmptyState = ({ title, hint }) => (
  <div style={{ ...font, textAlign: 'center', color: T.inkMuted, padding: '40px 16px' }}>
    <div style={{ fontWeight: 700, color: T.ink, marginBottom: 6 }}>{title}</div>{hint && <div style={{ fontSize: 13 }}>{hint}</div>}
  </div>
);
