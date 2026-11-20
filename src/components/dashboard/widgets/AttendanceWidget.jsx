import { useMemo, useState } from 'react';
import WidgetCard, { WidgetFilter } from '../WidgetCard.jsx';
import { DataTable, Segmented } from '../parts.jsx';
import { attendanceTally, formatRate, formatUnits, gradesInScope, sectionTitle } from '../../../lib/dashboardStats.js';
import { addDays, dayLabel, schoolDaysToDate, weekdaysOf } from '../../../lib/dates.js';

export function DayBars({ days, today }) {
  return <div className="sims-daybars" role="list" aria-label="Attendance rate by day">
    {days.map((d) => {
      const isToday = d.date === today;
      return <div role="listitem" key={d.date} className={`sims-daybar${isToday ? ' is-today' : ''}`}
        aria-label={`${dayLabel(d.date, { weekday: 'long', month: 'long', day: 'numeric' })}: ${d.rate == null ? 'not recorded' : `${d.rate}% present`}`}>
        <strong aria-hidden="true">{formatRate(d.rate)}</strong>
        <span className="sims-daybar-track" aria-hidden="true"><span className="sims-daybar-fill" style={{ height: `${d.rate ?? 0}%` }} /></span>
        <span aria-hidden="true">{isToday ? 'Today' : dayLabel(d.date, { weekday: 'short' })}</span>
      </div>;
    })}
  </div>;
}

const useTally = (data, dates, sectionIds) => useMemo(
  () => attendanceTally({ roster: data.rosterMap, attendance: data.attendance, schoolYear: data.schoolYear, dates, sectionIds }),
  [data.rosterMap, data.attendance, data.schoolYear, dates.join(), sectionIds?.join()], // eslint-disable-line react-hooks/exhaustive-deps
);

export function AttendanceCard({ data, expanded, onExpand }) {
  const [week, setWeek] = useState('this');
  const dates = weekdaysOf(week === 'this' ? data.today : addDays(data.today, -7));
  const tally = useTally(data, dates);
  return <WidgetCard title="Weekly attendance" subtitle="Present and late, as a share of learners in recorded sections"
    filter={<WidgetFilter label="Week" value={week} onChange={setWeek} options={[['this', 'This week'], ['last', 'Last week']]} />}
    expanded={expanded} onExpand={onExpand} resources={data.resources.roster} label="weekly attendance">
    <DayBars days={tally.days} today={data.today} />
  </WidgetCard>;
}

const unitColumns = [
  { key: 'present', label: 'Present', num: true }, { key: 'late', label: 'Late', num: true },
  { key: 'absent', label: 'Absent', num: true }, { key: 'excused', label: 'Excused', num: true }, { key: 'rate', label: 'Rate', num: true },
];
const unitCells = (t) => ({ present: formatUnits(t.present), late: formatUnits(t.late), absent: formatUnits(t.absent), excused: formatUnits(t.excused), rate: formatRate(t.rate) });

export function AttendanceDetail({ data }) {
  const [grade, setGrade] = useState('all');
  const [period, setPeriod] = useState('week');
  const grades = gradesInScope(data.sections, data.schoolYear);
  const sectionIds = grade === 'all' ? null : data.sections.filter((s) => s.schoolYear === data.schoolYear && Number(s.gradeLevel) === Number(grade)).map((s) => s.id);
  const dates = period === 'week' ? weekdaysOf(data.today) : schoolDaysToDate(data.today);
  const tally = useTally(data, dates, sectionIds);
  return <>
    <div className="sims-drawer-filters">
      <Segmented label="Period" value={period} onChange={setPeriod} options={[['week', 'This week'], ['month', 'Month to date']]} />
      <WidgetFilter label="Grade" value={grade} onChange={setGrade} options={[['all', 'All grades'], ...grades.map((g) => [String(g), `Grade ${g}`])]} />
    </div>
    {period === 'week' && <section className="sims-drawer-section"><DayBars days={tally.days} today={data.today} /></section>}
    <section className="sims-drawer-section"><h3>By day</h3>
      <DataTable label="Attendance by day" empty={['No school days yet', 'Weekdays in this period will appear here.']}
        columns={[{ key: 'date', label: 'Date' }, { key: 'recorded', label: 'Sections recorded', num: true }, ...unitColumns]}
        rows={tally.days.map((d) => ({ key: d.date, date: dayLabel(d.date, { weekday: 'short', month: 'short', day: 'numeric' }), recorded: d.sectionsRecorded, ...unitCells(d) }))} />
    </section>
    <section className="sims-drawer-section"><h3>By section</h3>
      <DataTable label="Attendance by section" empty={['No attendance recorded', 'Sections appear here once attendance is saved in this period.']}
        columns={[{ key: 'section', label: 'Section' }, { key: 'days', label: 'Days recorded', num: true }, ...unitColumns]}
        rows={tally.sections.map((s) => ({ key: s.sectionId, section: sectionTitle(data.sectionsById[s.sectionId]), days: s.daysRecorded, ...unitCells(s) }))
          .sort((a, b) => a.section.localeCompare(b.section))} />
    </section>
    <p className="sims-widget-note">Present includes late arrivals. A section-day without an attendance record is left out of the rate. Half-day absences count as half a day.</p>
  </>;
}
