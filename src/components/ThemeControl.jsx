import { useRef } from 'react';
import { PREFS, stepPref } from '../../shared/theme/theme.js';
import { useTheme } from '../hooks/useTheme.js';

export const THEME_LABEL = { auto: 'Auto', light: 'Light', dark: 'Dark' };

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
  return <div>
    <div role="radiogroup" aria-label="Theme" className="sims-theme-segments" onKeyDown={onKeyDown}>
      {PREFS.map((p) => <button key={p} ref={(node) => { refs.current[p] = node; }} type="button" role="radio"
        aria-checked={pref === p} tabIndex={pref === p ? 0 : -1} className="sims-theme-segment" onClick={() => setPref(p)}>
        {THEME_LABEL[p]}
      </button>)}
    </div>
    <p className="sims-theme-status" aria-live="polite">
      {pref === 'auto' ? `Auto: following your device (currently ${theme})` : `Always ${theme}`}
    </p>
  </div>;
}
