import { T } from '../styles.js';

export default function GradePills({ options, value, onChange, label, disabled = false }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            style={{
              fontFamily: T.body, fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
              cursor: disabled ? 'not-allowed' : 'pointer', padding: '9px 18px', borderRadius: T.pill, border: 'none',
              background: active ? T.primary : 'transparent', color: active ? '#fff' : T.inkMuted,
              opacity: disabled ? 0.6 : 1,
              transition: 'background 0.15s ease-out, color 0.15s ease-out, opacity 0.15s ease-out',
            }}
          >
            {option.label}{option.count == null ? '' : ` (${option.count})`}
          </button>
        );
      })}
    </div>
  );
}
