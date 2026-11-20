import { useId } from 'react';
import { Btn, Card, ResourceState, Sel } from '../ui.jsx';
import NavIcon from '../NavIcon.jsx';

// One compact filter in a card header. options: [[value, label], ...]
export function WidgetFilter({ label, value, options, onChange }) {
  return <Sel aria-label={label} className="sims-widget-filter" value={value} onChange={(e) => onChange(e.target.value)}>
    {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
  </Sel>;
}

// Dashboard card: title row (title, optional subtitle, optional filter, expand button) and a body that
// shows its own loading and error state, so one failed feed never blanks the page.
export default function WidgetCard({ title, subtitle, filter, expanded = false, onExpand, resources = [], label, className = '', footer, children }) {
  const headingId = useId();
  return <Card as="section" surface="summary" aria-labelledby={headingId} className={`sims-widget ${className}`}>
    <header className="sims-widget-head">
      <div className="sims-widget-titles">
        <h2 id={headingId}>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {filter}
      {onExpand && <Btn variant="icon" aria-label={`Expand ${title}`} title={`Expand ${title}`} aria-haspopup="dialog" aria-expanded={expanded} onClick={onExpand}>
        <NavIcon name="expand" size={18} />
      </Btn>}
    </header>
    <div className="sims-widget-body">
      <ResourceState resources={resources} label={label || title.toLowerCase()} inline>{children}</ResourceState>
    </div>
    {footer && <div className="sims-widget-foot">{footer}</div>}
    {onExpand && <Btn variant="quiet" className="sims-widget-more" onClick={onExpand}>View details</Btn>}
  </Card>;
}
