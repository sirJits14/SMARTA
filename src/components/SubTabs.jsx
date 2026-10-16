import { useState } from 'react';

// Index of the tab a key press should move to, or null for any other key.
export function nextTabIndex(key, index, count) {
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === 'ArrowRight') return (index + 1) % count;
  if (key === 'ArrowLeft') return (index - 1 + count) % count;
  return null;
}

// The remembered sub-tab for a page: the stored key when it is still one of
// `tabs`, else the first tab. Storage may be missing or throw.
export function useStoredTab(storageKey, tabs) {
  const [tab, setTabState] = useState(() => {
    try {
      const v = localStorage.getItem(storageKey);
      return tabs.some(([k]) => k === v) ? v : tabs[0][0];
    } catch { return tabs[0][0]; }
  });
  const setTab = (next) => {
    setTabState(next);
    try { localStorage.setItem(storageKey, next); } catch { /* the tab still switches without storage */ }
  };
  return [tab, setTab];
}

// `tabs` is a list of [key, title]. The page renders the matching
// `${idPrefix}-panel-${key}` tabpanel itself. `disabled` locks every tab.
export default function SubTabs({ tabs, value, onChange, idPrefix, label, className, style, disabled = false }) {
  return (
    <div className={className} role="tablist" aria-label={label} style={style}>
      {tabs.map(([k, title]) => {
        const active = value === k;
        return <button key={k} role="tab" className="sims-tab" id={`${idPrefix}-tab-${k}`}
          aria-selected={active} disabled={disabled} aria-controls={`${idPrefix}-panel-${k}`} tabIndex={active ? 0 : -1}
          onClick={() => onChange(k)} onKeyDown={(event) => {
            if (disabled) return;
            const next = nextTabIndex(event.key, tabs.findIndex(([key]) => key === k), tabs.length);
            if (next === null) return;
            event.preventDefault(); onChange(tabs[next][0]);
            document.getElementById(`${idPrefix}-tab-${tabs[next][0]}`)?.focus();
          }}>{title}</button>;
      })}
    </div>
  );
}
