import { useMemo, useState } from 'react';
import WidgetCard, { WidgetFilter } from '../WidgetCard.jsx';
import { DataTable } from '../parts.jsx';
import { EmptyState } from '../../ui.jsx';
import { gradesInScope, percentOf, sexBreakdown } from '../../../lib/dashboardStats.js';

const segmentsOf = (r) => [
  { key: 'male', label: 'Male', value: r.male },
  { key: 'female', label: 'Female', value: r.female },
  { key: 'unknown', label: 'Not recorded', value: r.unknown },
];

function Donut({ segments, total }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return <figure className="sims-donut">
    <svg viewBox="0 0 136 136" aria-hidden="true">
      <circle cx="68" cy="68" r={r} className="sims-donut-track" />
      {total > 0 && segments.filter((s) => s.value).map((s) => {
        const len = (c * s.value) / total;
        const arc = <circle key={s.key} cx="68" cy="68" r={r} className={`sims-donut-seg is-${s.key}`}
          strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} transform="rotate(-90 68 68)" />;
        offset += len;
        return arc;
      })}
    </svg>
    <figcaption><strong>{total.toLocaleString()}</strong><span>learners</span></figcaption>
  </figure>;
}

function Legend({ segments, total }) {
  return <ul className="sims-legend">
    {segments.filter((s) => s.key !== 'unknown' || s.value).map((s) => <li key={s.key}>
      <span className={`sims-legend-dot is-${s.key}`} aria-hidden="true" />{s.label}
      <strong>{s.value.toLocaleString()}</strong><small>{percentOf(s.value, total) ?? 0}%</small>
    </li>)}
  </ul>;
}

export function SexCard({ data, expanded, onExpand }) {
  const [grade, setGrade] = useState('all');
  const grades = gradesInScope(data.sections, data.schoolYear);
  const r = useMemo(() => sexBreakdown({ students: data.students, enrollments: data.enrollments, sections: data.sections, schoolYear: data.schoolYear, grade: grade === 'all' ? null : grade }),
    [data.students, data.enrollments, data.sections, data.schoolYear, grade]);
  const segments = segmentsOf(r);
  return <WidgetCard title="Learners by sex" subtitle="Enrolled this school year"
    filter={<WidgetFilter label="Grade" value={grade} onChange={setGrade} options={[['all', 'All grades'], ...grades.map((g) => [String(g), `Grade ${g}`])]} />}
    expanded={expanded} onExpand={onExpand} resources={data.resources.roster} label="learners by sex">
    {r.total ? <>
      <Donut segments={segments} total={r.total} />
      <Legend segments={segments} total={r.total} />
    </> : <EmptyState title="No enrolled learners" hint="Enrolled learners will be counted here." />}
  </WidgetCard>;
}

const sexColumns = (first) => [first,
  { key: 'male', label: 'Male', num: true }, { key: 'female', label: 'Female', num: true },
  { key: 'unknown', label: 'Not recorded', num: true }, { key: 'total', label: 'Total', num: true }];
const sexCells = (t) => ({ male: t.male.toLocaleString(), female: t.female.toLocaleString(), unknown: t.unknown.toLocaleString(), total: t.total.toLocaleString() });

export function SexDetail({ data }) {
  const r = useMemo(() => sexBreakdown({ students: data.students, enrollments: data.enrollments, sections: data.sections, schoolYear: data.schoolYear }),
    [data.students, data.enrollments, data.sections, data.schoolYear]);
  return <>
    <section className="sims-drawer-section"><h3>By grade</h3>
      <DataTable label="Learners by sex and grade" empty={['No enrolled learners', 'Enrolled learners will be counted here.']}
        columns={sexColumns({ key: 'grade', label: 'Grade' })}
        rows={r.byGrade.map((g) => ({ key: g.grade, grade: `Grade ${g.grade}`, ...sexCells(g) }))} />
    </section>
    <section className="sims-drawer-section"><h3>By section</h3>
      <DataTable label="Learners by sex and section" empty={['No enrolled learners', 'Enrolled learners will be counted here.']}
        columns={sexColumns({ key: 'section', label: 'Section' })}
        rows={r.bySection.map((s) => ({ key: s.sectionId, section: `Grade ${s.gradeLevel} · ${s.name}`, ...sexCells(s) }))} />
    </section>
    <p className="sims-widget-note">"Not recorded" counts learners whose sex is missing from their record.</p>
  </>;
}
