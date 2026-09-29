import { useMemo } from 'react';
import { useCollectionResource } from '../hooks/useCollection.js';
import { useLocalToday } from '../hooks/useLocalToday.js';
import { fullName } from '../lib/roster.js';
import { activeStudentCount, enrolledCount, countByGrade, attendanceCoverage, recentEnrollments, unassignedCount } from '../lib/dashboardStats.js';
import { UNASSIGNED } from '../lib/constants.js';
import { Btn, Card, EmptyState, ResourceState } from '../components/ui.jsx';
import GradeBarChart from '../components/GradeBarChart.jsx';
import AttentionPanel from '../components/dashboard/AttentionPanel.jsx';
import CoveragePanel from '../components/dashboard/CoveragePanel.jsx';
import NavIcon from '../components/NavIcon.jsx';
export default function DashboardPage({ schoolYear, setPage }) {
  const studentsResource = useCollectionResource('students');
  const sectionsResource = useCollectionResource('sections');
  const enrollmentsResource = useCollectionResource('enrollments');
  const attendanceResource = useCollectionResource('student_attendance');
  const students = studentsResource.data, sections = sectionsResource.data, enrollments = enrollmentsResource.data, attendance = attendanceResource.data;
  const resources = [studentsResource,sectionsResource,enrollmentsResource,attendanceResource];
  const today = useLocalToday();
  const coverage = useMemo(() => attendanceCoverage({ students,sections,enrollments,attendance,schoolYear,date:today }),[students,sections,enrollments,attendance,schoolYear,today]);
  const recent = useMemo(() => recentEnrollments(enrollments,schoolYear,5),[enrollments,schoolYear]);
  const studentsById = useMemo(() => Object.fromEntries(students.map(s => [s.id,s])),[students]);
  const sectionsById = useMemo(() => Object.fromEntries(sections.map(s => [s.id,s])),[sections]);
  const stats = [
    ['Active learners',activeStudentCount(students),'students'],
    ['Enrolled this school year',enrolledCount(enrollments,schoolYear),'enroll'],
    ['Sections this school year',sections.filter(s=>s.schoolYear===schoolYear).length,'sections'],
  ];
  const dateLabel = new Date(today+'T12:00:00').toLocaleDateString('en-PH',{ weekday:'long',month:'long',day:'numeric',year:'numeric' });
  return <div className="sims-dashboard">
    <div className="sims-heading"><div><h1>Your school day, at a glance.</h1><p className="sims-dashboard-date">{dateLabel}</p></div><Btn onClick={()=>setPage('enroll')}>Enroll a learner <NavIcon name="enroll" size={17}/></Btn></div>
    <ResourceState resources={resources} label="dashboard">
      <AttentionPanel unassigned={unassignedCount(students,enrollments,schoolYear)} pendingSections={coverage.pendingSections}
        totalSections={coverage.totalSections} date={today}
        onUnassigned={()=>setPage('students',{gradeFilter:UNASSIGNED,status:'active'})}
        onSection={section=>setPage('attendance',{attendanceEntry:{sectionId:section.id,date:today}})}/>
      <div className="sims-dashboard-totals">{stats.map(([label,value,icon])=><Card surface="summary" className="sims-stat" key={label}>
        <div><div className="sims-stat-label">{label}</div><strong>{value.toLocaleString()}</strong></div><NavIcon name={icon} size={28}/>
      </Card>)}</div>
      <div className="sims-dashboard-charts">
        <Card surface="summary" className="sims-chart-card"><h2>Enrollment by grade</h2><p>Current school-year enrollment, across all sections</p>
          {enrolledCount(enrollments,schoolYear) ? <GradeBarChart counts={countByGrade(enrollments,schoolYear)}/> : <EmptyState title="No enrollments yet" hint="Enroll a learner to begin your school-year overview."/>}
        </Card>
        <CoveragePanel {...coverage}/>
      </div>
      <Card surface="summary" className="sims-recent"><div className="sims-section-label"><h2>Recent enrollments</h2><span>This school year</span></div>
        {recent.length ? <div className="sims-table-scroll" role="region" aria-label="Recent enrollments" tabIndex={0}>
          <table><thead><tr><th>Learner</th><th>Section</th><th>Enrolled</th></tr></thead><tbody>
            {recent.map(e=><tr key={e.studentId+'_'+e.schoolYear}><td><strong>{studentsById[e.studentId] ? fullName(studentsById[e.studentId]) : 'Unavailable learner'}</strong></td><td>{sectionsById[e.sectionId]?.name || 'Unavailable section'}</td><td>{e.dateEnrolled || '—'}</td></tr>)}
          </tbody></table>
        </div> : <EmptyState title="No recent enrollments" hint="New enrollments for this school year will appear here."/>}
      </Card>
    </ResourceState>
  </div>;
}
