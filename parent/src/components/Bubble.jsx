import { T } from '../styles.js';

const R = 18, TIGHT = 6;

// One text-message bubble, received-side (left-aligned). In a stacked run
// only the first bubble keeps a round top-left corner and only the last keeps
// a round bottom-left one, so back-to-back bubbles read as a single group --
// the way chat apps stack consecutive texts from one sender.
export function Bubble({ id, title, time, body, meta, first = true, last = true, unread = false, struck = false, highlight = false, onClick, children }) {
  const shell = {
    display: 'block', width: 'fit-content', maxWidth: '85%', boxSizing: 'border-box', textAlign: 'left',
    margin: `0 0 ${last ? 0 : 3}px`, padding: '9px 14px', fontFamily: T.font, color: T.ink,
    background: unread ? 'rgba(91,79,232,0.10)' : T.surface,
    border: `1px solid ${highlight ? T.primary : T.border}`,
    boxShadow: highlight ? `0 0 0 2px ${T.primary}` : 'none',
    borderRadius: `${first ? R : TIGHT}px ${R}px ${R}px ${last ? R : TIGHT}px`,
  };
  const strike = struck ? 'line-through' : 'none';
  const inner = (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontWeight: unread ? 700 : 600, fontSize: 15, textDecoration: strike }}>{title}</span>
        {time && <span style={{ fontSize: 12, color: T.inkMuted, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', textDecoration: strike }}>{time}</span>}
      </div>
      {body && <div style={{ fontSize: 14, marginTop: 2 }}>{body}</div>}
      {meta && <div style={{ fontSize: 12, color: T.inkMuted, marginTop: 2 }}>{meta}</div>}
      {children}
    </>
  );
  return onClick
    ? <button id={id} type="button" onClick={onClick} style={{ ...shell, minHeight: T.tap, cursor: 'pointer' }}>{inner}</button>
    : <div id={id} style={shell}>{inner}</div>;
}

export const DayDivider = ({ label }) => (
  <div role="separator" aria-label={label} style={{ textAlign: 'center', margin: '14px 0 8px' }}>
    <span style={{ fontFamily: T.font, fontSize: 12, fontWeight: 600, color: T.inkMuted, background: T.border, borderRadius: T.pill, padding: '3px 10px' }}>{label}</span>
  </div>
);
