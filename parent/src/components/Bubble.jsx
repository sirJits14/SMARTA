// A minimal received-side text bubble for History scans and Inbox messages.
// Two short lines: a status dot and the title, then the gate/notes with the
// time at the right. In a stacked run only the first bubble keeps a round
// top-left corner and only the last a round bottom-left one, so back-to-back
// bubbles read as one group, the way chat apps stack texts from one sender.
// `tone` colors the dot: 'in' (filled green), 'out' (hollow ring), 'school'
// (filled teal); the title says the same thing in words. `onClick` makes the
// bubble a button; `actionLabel` tells screen readers what it opens.
// Styles in glass.css.
export function Bubble({ id, tone, title, time, meta, body, first = true, last = true, unread, struck, highlight, onClick, actionLabel }) {
  const className = ['bubble', first && 'bubble--first', last && 'bubble--last', unread && 'bubble--unread',
    highlight && 'bubble--highlight', struck && 'bubble--struck'].filter(Boolean).join(' ');
  // Spans rather than divs: this content can sit inside a <button>.
  const inner = (
    <>
      <span className="bubble-title-row">
        {tone && <span className={`bubble-dot bubble-dot--${tone}`} aria-hidden="true" />}
        <span className="bubble-title">{title}</span>
      </span>
      {body && <span className="bubble-text">{body}</span>}
      <span className="bubble-foot">
        {meta && <span className="bubble-meta">{meta}</span>}
        {time && <span className="bubble-time">{time}</span>}
      </span>
      {onClick && <span className="sr-only">{actionLabel}</span>}
    </>
  );
  return onClick
    ? <button id={id} type="button" className={className} onClick={onClick}>{inner}</button>
    : <div id={id} className={className}>{inner}</div>;
}

export const DayDivider = ({ label }) => (
  <div role="separator" aria-label={label} className="bubble-day">{label}</div>
);
