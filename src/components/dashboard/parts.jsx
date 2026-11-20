import { EmptyState } from '../ui.jsx';
import NavIcon from '../NavIcon.jsx';

// Detail table inside a named, keyboard-scrollable region. The first column is the row header.
export function DataTable({ label, columns, rows, empty }) {
  if (!rows.length) return <EmptyState title={empty[0]} hint={empty[1]} />;
  return <div className="sims-table-scroll" role="region" aria-label={label} tabIndex={0}>
    <table className="sims-widget-table">
      <thead><tr>{columns.map((c) => <th key={c.key} scope="col" className={c.num ? 'is-num' : undefined}>{c.label}</th>)}</tr></thead>
      <tbody>{rows.map((row) => <tr key={row.key}>{columns.map((c, i) => (i === 0
        ? <th key={c.key} scope="row">{row[c.key]}</th>
        : <td key={c.key} className={c.num ? 'is-num' : undefined}>{row[c.key]}</td>))}</tr>)}</tbody>
    </table>
  </div>;
}

// One-of-many filter in a drawer, using the existing segmented control. options: [[value, label], ...]
export function Segmented({ label, value, options, onChange }) {
  return <div role="group" aria-label={label} className="sims-segmented">
    {options.map(([v, text]) => <button key={v} type="button" className="sims-segment" aria-pressed={value === v} onClick={() => onChange(v)}>{text}</button>)}
  </div>;
}

// A full-width actionable row: title and optional meta on the left, action text and chevron on the right.
export function ListRow({ title, meta, action, onClick, icon }) {
  return <button type="button" className="sims-list-row" onClick={onClick}>
    <span className="sims-list-main">
      {icon && <NavIcon name={icon} size={16} />}
      <span><strong>{title}</strong>{meta && <small>{meta}</small>}</span>
    </span>
    <span className="sims-list-action">{action}<NavIcon name="chevronRight" size={16} /></span>
  </button>;
}
