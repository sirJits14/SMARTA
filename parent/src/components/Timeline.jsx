import Icon from './Icon.jsx';

// A day heading between timeline rows: "Today", "Yesterday", "Tue, Oct 6".
export const TimelineDay = ({ label }) => (
  <div role="separator" aria-label={label} className="timeline-day"><span>{label}</span></div>
);

// One record in a flat, edge-to-edge list (History scans, Inbox items).
// `tone` colors the dot: 'in' (filled green), 'out' (hollow ring), 'school'
// (filled teal); the title always says the same thing in words. `onClick`
// makes the row a button; `actionLabel` tells screen readers what it opens.
// Styles in glass.css.
export function TimelineRow({ id, tone = 'out', title, time, meta, body, struck, unread, highlight, onClick, actionLabel }) {
  const className = ['timeline-row', unread && 'timeline-row--unread', highlight && 'timeline-row--highlight', struck && 'timeline-row--struck']
    .filter(Boolean).join(' ');
  // Spans rather than divs: this content can sit inside a <button>.
  const inner = (
    <>
      <span className={`timeline-dot timeline-dot--${tone}`} aria-hidden="true" />
      <span className="timeline-body">
        <span className="timeline-top">
          <span className="timeline-title">{title}</span>
          {time && <span className="timeline-time">{time}</span>}
        </span>
        {meta && <span className="timeline-meta">{meta}</span>}
        {body && <span className="timeline-text">{body}</span>}
      </span>
      {onClick && <span className="sr-only">{actionLabel}</span>}
      {onClick && <span className="timeline-chevron" aria-hidden="true"><Icon name="chevron" size={16} /></span>}
    </>
  );
  return onClick
    ? <button id={id} type="button" className={className} onClick={onClick}>{inner}</button>
    : <div id={id} className={className}>{inner}</div>;
}
