import { Btn } from '../../components/ui.jsx';
import { T } from '../../styles.js';
import { sectionLabel } from '../../../parent/src/lib/school.js';

// Old adviser slips grant nothing now. Each teacher who used one appears once,
// with the class most of their learners are in, so an administrator can
// confirm and assign in one pass.
export default function LegacyAdvisers({ rows, sections, disabled, onUse }) {
  if (!rows.length) return <p style={{ fontSize: 13 }}>No legacy adviser links to verify.</p>;
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {rows.map((row) => {
        const section = sections.find((s) => s.id === row.suggestedSectionId);
        const details = [row.email, `${row.learnerCount} learner link${row.learnerCount === 1 ? '' : 's'}`, section ? `Likely ${sectionLabel(section)}` : 'Section unknown'];
        return (
          <li key={row.guardianUid} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 0', borderTop: `1px solid ${T.border}` }}>
            <span style={{ minWidth: 0 }}>
              <strong>{row.name || row.email || 'Unnamed account'}</strong><br />
              <span style={{ fontSize: 13, color: T.inkMuted, overflowWrap: 'anywhere' }}>{details.filter(Boolean).join(' · ')}</span>
            </span>
            {row.assigned
              ? <span style={{ fontSize: 13, fontWeight: 600, color: T.inkMuted }}>Assigned</span>
              : <Btn variant="ghost" disabled={disabled || !row.email} onClick={() => onUse(row)}>Use in form</Btn>}
          </li>
        );
      })}
    </ul>
  );
}
