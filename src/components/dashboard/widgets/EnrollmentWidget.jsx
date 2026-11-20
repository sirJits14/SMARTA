import { useMemo } from 'react';
import WidgetCard from '../WidgetCard.jsx';
import { DataTable } from '../parts.jsx';
import GradeBarChart from '../../GradeBarChart.jsx';
import { EmptyState } from '../../ui.jsx';
import { fullName } from '../../../lib/roster.js';
import { countByGrade, enrolledCount, recentEnrolledSections, recentEnrollments, sectionTitle, shsBreakdown } from '../../../lib/dashboardStats.js';

export function EnrollmentCard({ data, expanded, onExpand }) {
  const { enrollments, schoolYear, admin } = data;
  return <WidgetCard title="Enrollment by grade" subtitle={admin ? 'This school year, across all sections' : 'This school year, in your grade levels'}
    expanded={expanded} onExpand={onExpand} resources={data.resources.roster} label="enrollment">
    {enrolledCount(enrollments, schoolYear)
      ? <GradeBarChart counts={countByGrade(enrollments, schoolYear)} />
      : <EmptyState title="No enrollments yet" hint="Enroll a learner to begin your school-year overview." />}
  </WidgetCard>;
}

export function EnrollmentDetail({ data }) {
  const { enrollments, sections, schoolYear, studentsById, sectionsById } = data;
  const bySection = useMemo(() => recentEnrolledSections(enrollments, schoolYear), [enrollments, schoolYear]);
  const shs = useMemo(() => shsBreakdown(enrollments, sections, schoolYear), [enrollments, sections, schoolYear]);
  const recent = useMemo(() => recentEnrollments(enrollments, schoolYear, 30), [enrollments, schoolYear]);
  return <>
    <section className="sims-drawer-section"><h3>By grade</h3>
      {enrolledCount(enrollments, schoolYear)
        ? <GradeBarChart counts={countByGrade(enrollments, schoolYear)} />
        : <EmptyState title="No enrollments yet" hint="Enroll a learner to begin your school-year overview." />}
    </section>
    <section className="sims-drawer-section"><h3>Sections</h3>
      <DataTable label="Enrolled learners by section" empty={['No enrolled sections', 'Sections with enrollments this school year will appear here.']}
        columns={[{ key: 'section', label: 'Section' }, { key: 'latest', label: 'Latest enrollment', nowrap: true }, { key: 'count', label: 'Enrolled learners', num: true }]}
        rows={bySection.map((r) => ({ key: r.sectionId, section: sectionTitle(sectionsById[r.sectionId]), latest: r.latestDate || '—', count: r.count.toLocaleString() }))} />
    </section>
    {shs.length > 0 && <section className="sims-drawer-section"><h3>Senior high track and strand</h3>
      <DataTable label="Senior high enrollment by track and strand"
        columns={[{ key: 'track', label: 'Track' }, { key: 'strand', label: 'Strand' }, { key: 'count', label: 'Learners', num: true }]}
        rows={shs.map((r) => ({ key: `${r.track}|${r.strand}`, track: r.track, strand: r.strand, count: r.count.toLocaleString() }))} />
    </section>}
    <section className="sims-drawer-section"><h3>Recent enrollments</h3>
      <DataTable label="Recent enrollments" empty={['No recent enrollments', 'New enrollments for this school year will appear here.']}
        columns={[{ key: 'learner', label: 'Learner' }, { key: 'section', label: 'Section' }, { key: 'date', label: 'Enrolled', nowrap: true }]}
        rows={recent.map((e) => ({ key: `${e.studentId}_${e.schoolYear}`, learner: studentsById[e.studentId] ? fullName(studentsById[e.studentId]) : 'Unavailable learner',
          section: sectionTitle(sectionsById[e.sectionId]), date: e.dateEnrolled || '—' }))} />
    </section>
  </>;
}
