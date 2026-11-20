import NavIcon from '../../NavIcon.jsx';
import { canOpen } from '../../../lib/access.js';
import { activeStudentCount, enrolledCount, formatRate } from '../../../lib/dashboardStats.js';
import { isWeekend } from '../../../lib/dates.js';
import { UNASSIGNED } from '../../../lib/constants.js';

// Headline numbers. A tile is a button only when it has somewhere this person may go.
export default function KpiStrip({ data, todayRate, onNavigate, onOpenPanel }) {
  const { me, admin, canRequests, students, enrollments, sections, schoolYear, coverage, requests, today, unassignedTotal } = data;
  const rate = isWeekend(today) ? null : todayRate;
  const page = (name, params) => (canOpen(me, name) ? () => onNavigate(name, params ?? null) : null);
  const tiles = [
    { label: 'Active learners', value: activeStudentCount(students), icon: 'students', go: page('students', { status: 'active' }) },
    { label: 'Enrolled this school year', value: enrolledCount(enrollments, schoolYear), icon: 'enroll', go: page('enroll') },
    { label: 'Sections this school year', value: sections.filter((s) => s.schoolYear === schoolYear).length, icon: 'sections', go: page('sections') },
    { label: "Today's present rate", value: formatRate(rate), icon: 'attendance', go: () => onOpenPanel('attendance'),
      sub: rate == null ? (isWeekend(today) ? 'No school day today' : 'No attendance recorded today') : `${coverage.recordedCount} of ${coverage.totalSections} sections recorded` },
    admin && { label: 'Unassigned learners', value: unassignedTotal, icon: 'students',
      go: page('students', { gradeFilter: UNASSIGNED, status: 'active' }) },
    canRequests && { label: 'Open learner requests', value: requests.truncated ? `${requests.count}+` : requests.count, icon: 'accounts',
      go: page('learnerRequests') },
  ].filter(Boolean);
  return <div className="sims-kpis">
    {tiles.map((t) => {
      const body = <>
        <span className="sims-kpi-label"><NavIcon name={t.icon} size={16} />{t.label}</span>
        <strong>{typeof t.value === 'number' ? t.value.toLocaleString() : t.value}</strong>
        {t.sub && <small>{t.sub}</small>}
      </>;
      return t.go
        ? <button type="button" key={t.label} className="sims-kpi" onClick={t.go}>{body}</button>
        : <div key={t.label} className="sims-kpi">{body}</div>;
    })}
  </div>;
}
