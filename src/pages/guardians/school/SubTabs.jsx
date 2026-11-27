// Arrow keys, Home and End move between tabs, matching the Guardians tabs.
export default function SubTabs({ id, label, tabs, value, onChange }) {
  return <div className="sims-tabs" role="tablist" aria-label={label}>
    {tabs.map(([key, text]) => {
      const active = value === key;
      return <button key={key} type="button" role="tab" className="sims-tab" id={`${id}-tab-${key}`} aria-selected={active}
        aria-controls={`${id}-panel`} tabIndex={active ? 0 : -1} onClick={() => onChange(key)} onKeyDown={event => {
          const index = tabs.findIndex(([k]) => k === key);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 :
            event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : null;
          if (next === null) return;
          event.preventDefault(); onChange(tabs[next][0]);
          document.getElementById(`${id}-tab-${tabs[next][0]}`)?.focus();
        }}>{text}</button>;
    })}
  </div>;
}
