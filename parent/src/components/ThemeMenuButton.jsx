import { useEffect, useId, useRef, useState } from 'react';
import S from '../strings.js';
import Icon from './Icon.jsx';
import { THEME_LABEL } from './ThemeControl.jsx';
import { PREFS, stepPref } from '../../../shared/theme/theme.js';
import { useTheme } from '../hooks/useTheme.js';

// Header shortcut: a sun/moon button that opens Auto / Light / Dark.
export default function ThemeMenuButton() {
  const { pref, theme, setPref } = useTheme();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const itemRefs = useRef({});
  useEffect(() => {
    if (!open) return undefined;
    itemRefs.current[pref]?.focus();
    const away = (event) => { if (!wrapRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]); // focus the checked item only when the menu opens, not on every choice
  const close = () => { setOpen(false); buttonRef.current?.focus(); };
  const onMenuKeyDown = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key === 'Tab') { setOpen(false); return; }
    const focused = PREFS.find((p) => itemRefs.current[p] === document.activeElement) ?? pref;
    const next = stepPref(focused, event.key);
    if (next) { event.preventDefault(); itemRefs.current[next]?.focus(); }
  };
  return (
    <div className="theme-menu" ref={wrapRef}>
      <button ref={buttonRef} type="button" className="theme-menu-btn" aria-haspopup="menu" aria-expanded={open}
        aria-controls={open ? menuId : undefined} aria-label={`${S.themeTitle}: ${THEME_LABEL[pref]}`} onClick={() => setOpen((o) => !o)}>
        <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={22} />
        {pref === 'auto' && <span className="theme-auto-badge" aria-hidden="true">A</span>}
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={S.themeTitle} className="theme-popover" onKeyDown={onMenuKeyDown}>
          {PREFS.map((p) => (
            <button key={p} ref={(node) => { itemRefs.current[p] = node; }} type="button" role="menuitemradio" aria-checked={pref === p}
              tabIndex={pref === p ? 0 : -1} className="theme-option" onClick={() => { setPref(p); close(); }}>
              <span>{THEME_LABEL[p]}</span>{pref === p && <Icon name="check" size={18} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
