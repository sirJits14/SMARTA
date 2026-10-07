import Icon from './Icon.jsx';

// iPhone Settings-style building blocks: a rounded group of rows, each with an
// optional colored icon tile, a value and a chevron. Styles in glass.css.

export function SettingsGroup({ header, footer, children }) {
  return (
    <section className="settings-group-wrap">
      {header && <h2 className="settings-group-header">{header}</h2>}
      <div className="glass-card settings-group">{children}</div>
      {footer && <p className="settings-group-footer">{footer}</p>}
    </section>
  );
}

export const IconTile = ({ tile, icon }) => (
  <span className="settings-tile" style={{ background: `var(--tile-${tile})` }} aria-hidden="true"><Icon name={icon} size={18} /></span>
);

// Rows without a tile or avatar get a hairline that starts at the text, not past the tile.
const rowClass = (inset, variant) => `settings-row${inset ? '' : ' settings-row--plain'}${variant ? ` settings-row--${variant}` : ''}`;

// `onClick` makes a button, `href` a link, neither a static row. `leading`
// replaces the tile (e.g. an avatar). `tone`: 'primary' | 'danger'.
// `variant`: 'profile' (tall) | 'center' (centered label, e.g. Sign out).
export function SettingsRow({ tile, icon, leading, label, subtitle, value, onClick, href, external, tone, variant, disabled, chevron = Boolean(onClick || href) }) {
  const body = (
    <>
      {leading ?? (tile && <IconTile tile={tile} icon={icon} />)}
      <span className="settings-row-text">
        <span className={`settings-row-label${tone ? ` settings-row-label--${tone}` : ''}`}>{label}</span>
        {subtitle && <span className="settings-row-subtitle">{subtitle}</span>}
      </span>
      {value !== undefined && value !== '' && <span className="settings-row-value">{value}</span>}
      {chevron && <span className="settings-row-chevron"><Icon name="chevron" size={18} /></span>}
    </>
  );
  const className = rowClass(Boolean(leading || tile), variant);
  if (href) return <a className={className} href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>{body}</a>;
  if (onClick) return <button type="button" className={className} onClick={onClick} disabled={disabled}>{body}</button>;
  return <div className={className}>{body}</div>;
}

// The whole row is the switch, so the tap target is the full row.
export function SwitchRow({ label, checked, onChange, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className={rowClass(false)} disabled={disabled} onClick={() => onChange(!checked)}>
      <span className="settings-row-text"><span className="settings-row-label">{label}</span></span>
      <span className="settings-switch" aria-hidden="true" />
    </button>
  );
}
