import { useEffect, useId, useRef, useState } from 'react';
import NavIcon from './NavIcon.jsx';
import { PREFS } from '../../shared/theme/theme.js';
import { useTheme } from '../hooks/useTheme.js';
import { THEME_LABEL } from '../lib/themeLabels.js';
import { roleLabel } from '../../shared/staffRoles.js';

const THEME_ICON = { auto: 'theme', light: 'sun', dark: 'moon' };
export const initials = (name = '', email = '') => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] || email || '?').slice(0, 2);
  return letters.toUpperCase();
};

// Sidebar account row: avatar, name and role. Opens a menu with the theme
// choice (Auto / Light / Dark, saved per device) and Sign out.
export default function AccountMenu({ me, collapsed, onLogout, hint }) {
  const { pref, theme, setPref } = useTheme();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const items = () => [...(menuRef.current?.querySelectorAll('[role^="menuitem"]') ?? [])];
  useEffect(() => {
    if (!open) return undefined;
    (menuRef.current?.querySelector('[aria-checked="true"]') ?? items()[0])?.focus();
    const away = (event) => { if (!wrapRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  const close = () => { setOpen(false); buttonRef.current?.focus(); };
  const onKeyDown = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key === 'Tab') { setOpen(false); return; }
    const list = items();
    const at = list.indexOf(document.activeElement);
    const next = event.key === 'ArrowDown' ? (at + 1) % list.length
      : event.key === 'ArrowUp' ? (at - 1 + list.length) % list.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : -1;
    if (next >= 0) { event.preventDefault(); list[next].focus(); }
  };
  const label = `Account and appearance, ${me.name}`;
  return <div className="sims-account" ref={wrapRef}>
    <button ref={buttonRef} type="button" className="sims-account-button" aria-haspopup="menu" aria-expanded={open}
      aria-controls={open ? menuId : undefined} aria-label={collapsed ? label : undefined}
      onClick={() => setOpen((o) => !o)} {...(collapsed && !open ? hint(label) : {})}>
      <span className="sims-avatar" aria-hidden="true">{initials(me.name, me.email)}</span>
      {!collapsed && <><span className="sims-account-text">
        <span className="sims-account-name">{me.name}</span>
        <span className="sims-account-role">{roleLabel(me)}</span>
      </span><NavIcon name="chevrons" size={16} /></>}
    </button>
    {open && <div id={menuId} ref={menuRef} role="menu" aria-label="Account" className="sims-menu" onKeyDown={onKeyDown}>
      <div className="sims-menu-label" aria-hidden="true">Appearance</div>
      <div role="group" aria-label="Appearance">
        {PREFS.map((p) => <button key={p} type="button" role="menuitemradio" aria-checked={pref === p} tabIndex={-1}
          className="sims-menu-item" onClick={() => { setPref(p); close(); }}>
          <NavIcon name={THEME_ICON[p]} size={16} /><span>{THEME_LABEL[p]}</span>
          <span className="sims-menu-check">{pref === p && <NavIcon name="check" size={16} />}</span>
        </button>)}
      </div>
      <p className="sims-menu-note">{pref === 'auto' ? `Following your device (${theme}). Saved on this device.` : 'Saved on this device.'}</p>
      <div className="sims-menu-sep" role="separator" />
      <button type="button" role="menuitem" tabIndex={-1} className="sims-menu-item" onClick={() => { setOpen(false); onLogout(); }}>
        <NavIcon name="logout" size={16} /><span>Sign out</span>
      </button>
    </div>}
  </div>;
}
