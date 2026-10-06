import { useRef } from 'react';
import S from '../strings.js';
import { T } from '../styles.js';
import { PREFS, stepPref } from '../../../shared/theme/theme.js';
import { useTheme } from '../hooks/useTheme.js';

export const THEME_LABEL = { auto: S.themeAuto, light: S.themeLight, dark: S.themeDark };

// Auto / Light / Dark as one radio group: arrow keys move and select, like native radios.
export default function ThemeControl() {
  const { pref, theme, setPref } = useTheme();
  const refs = useRef({});
  const onKeyDown = (event) => {
    const next = stepPref(pref, event.key);
    if (!next) return;
    event.preventDefault();
    setPref(next);
    refs.current[next]?.focus();
  };
  const status = pref === 'auto'
    ? (theme === 'dark' ? S.themeAutoStatusDark : S.themeAutoStatusLight)
    : (theme === 'dark' ? S.themeFixedDark : S.themeFixedLight);
  return (
    <div>
      <div role="radiogroup" aria-label={S.themeGroupLabel} className="theme-segments" onKeyDown={onKeyDown}>
        {PREFS.map((p) => (
          <button key={p} ref={(node) => { refs.current[p] = node; }} type="button" role="radio" aria-checked={pref === p}
            tabIndex={pref === p ? 0 : -1} className="theme-segment" onClick={() => setPref(p)}>{THEME_LABEL[p]}</button>
        ))}
      </div>
      <p aria-live="polite" style={{ fontSize: 13, color: T.inkMuted, margin: '10px 0 0' }}>{status}</p>
    </div>
  );
}
