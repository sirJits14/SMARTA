import { T } from '../styles.js';
import loadingGif from '../assets/loading.gif';

// Buttons: solid = the screen's main action, ghost = secondary (bordered), danger = destructive.
// States (hover, active, focus, disabled) live in app.css; `style` is for layout only.
export const Btn = ({ variant = 'solid', className = '', ...p }) => (
  <button {...p} className={`p-btn p-btn--${variant} ${className}`} />
);
// Flat bordered surface (.card in app.css).
export const Card = ({ style, className, ...p }) => <section {...p} className={className ? `card ${className}` : 'card'} style={{ borderRadius: T.radius, padding: 16, marginBottom: 12, ...style }} />;
export const Field = ({ label, children, hint }) => (
  <label className="p-field">
    <span className="p-field-label">{label}</span>
    {children}
    {hint && <span className="p-field-hint">{hint}</span>}
  </label>
);
export const Inp = ({ className = '', ...p }) => <input {...p} className={`p-input ${className}`} />;
export const Sel = ({ className = '', ...p }) => <select {...p} className={`p-input ${className}`} />;
export const Banner = ({ tone = 'info', children, action }) => (
  <div role={tone === 'danger' ? 'alert' : 'status'} className={`p-banner p-banner--${tone}`}>
    <span>{children}</span>{action}
  </div>
);
export const Spinner = ({ label }) => (
  <div role="status" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
    <img src={loadingGif} alt={label} width={48} height={48} />
  </div>
);
export const EmptyState = ({ title, hint }) => (
  <div className="p-empty">
    <div className="p-empty-title">{title}</div>{hint && <div className="p-empty-hint">{hint}</div>}
  </div>
);
