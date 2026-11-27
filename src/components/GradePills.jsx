// A count beside a segment label. Screen readers hear "Grade 7 (4)"; the eye sees a muted number.
export const SegmentCount = ({ count }) => <span className="sims-segment-count"><span className="sims-sr-only"> (</span>{count}<span className="sims-sr-only">)</span></span>;

// A one-of-many filter drawn as a segmented control (styles in registrar.css).
export default function GradePills({ options, value, onChange, label, disabled = false }) {
  return (
    <div role="group" aria-label={label} className="sims-segmented">
      {options.map((option) => (
        <button key={String(option.value)} type="button" className="sims-segment" aria-pressed={option.value === value}
          disabled={disabled} onClick={() => onChange(option.value)}>
          {option.label}{option.count != null && <SegmentCount count={option.count} />}
        </button>
      ))}
    </div>
  );
}
