import { useState } from 'react';
import { Btn, Card, EmptyState } from '../../../components/ui.jsx';
import { T, S } from '../../../styles.js';
import { coverageByGrade, coverageCsvRows } from '../../../lib/schoolAssignments.js';
import { downloadCsv } from './downloadCsv.js';
import OpenedTag from './OpenedTag.jsx';
import { personLabel } from '../../../lib/roster.js';

const who = personLabel;

// Which sections still need an adviser, grade by grade.
export default function CoverageView({ context, onAssign, onOpenRequest }) {
  const [gapsOnly, setGapsOnly] = useState(false);
  const groups = coverageByGrade(context.sections, context.managedAssignments, context.pendingRequests);
  return <>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <input type="checkbox" checked={gapsOnly} onChange={e => setGapsOnly(e.target.checked)} style={{ width: 18, height: 18 }} />Only sections without an adviser</label>
      <Btn variant="ghost" disabled={!groups.length} onClick={() => downloadCsv(`school-coverage-${context.schoolYear}.csv`, coverageCsvRows(groups))}>Export CSV</Btn>
    </div>
    {groups.length === 0 && <Card style={{ padding: 20 }}><EmptyState title="No sections this school year" hint="Add sections on the Sections page first." /></Card>}
    {groups.map(g => {
      const rows = gapsOnly ? g.rows.filter(r => !r.adviser) : g.rows;
      return <Card key={g.grade} style={{ padding: 20, marginBottom: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 16px' }}>
          <h3 style={{ ...S.h2, margin: 0 }}>Grade {g.grade}</h3>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{`${g.covered} of ${g.rows.length} sections have an adviser`}</span>
          <span style={{ fontSize: 13, color: T.inkMuted }}>{`Curriculum Adviser: ${g.curriculumAdvisers.map(who).join(', ') || 'None'}`}</span>
        </div>
        {rows.length === 0
          ? <p style={{ fontSize: 13, color: T.inkMuted, margin: '12px 0 0' }}>Every Grade {g.grade} section has an adviser.</p>
          : <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>{rows.map(row => <li key={row.section.id} className="school-coverage-row">
            <strong>{row.section.name || row.section.id}</strong>
            {row.adviser
              ? <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>{who(row.adviser)}<OpenedTag item={row.adviser} /></span>
              : <span className="school-gap">No adviser</span>}
            <span>{!row.adviser && (row.pending
              ? <Btn variant="ghost" onClick={() => onOpenRequest(row.pending.id)}>{`Review ${who(row.pending)}'s request`}</Btn>
              : <Btn variant="ghost" disabled={context.ended} onClick={() => onAssign({ role: 'adviser', sectionId: row.section.id })}>Assign</Btn>)}</span>
          </li>)}</ul>}
      </Card>;
    })}
  </>;
}
