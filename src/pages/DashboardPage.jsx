import { useMemo } from 'react';
import { useCollection } from '../hooks/useCollection.js';
import { fullName } from '../lib/roster.js';
import { localDate } from '../lib/dates.js';
import { activeStudentCount, enrolledCount, countByGrade, todayAttendance, recentEnrollments, unassignedCount } from '../lib/dashboardStats.js';
import { UNASSIGNED } from '../lib/constants.js';
import { T, S } from '../styles.js';
import { Btn, Card } from '../components/ui.jsx';
import GradeBarChart from '../components/GradeBarChart.jsx';

export default function DashboardPage({ schoolYear, setPage }) {
  const students = useCollection('students');
  const sections = useCollection('sections');
  const enrollments = useCollection('enrollments');
  const attendance = useCollection('student_attendance');

  const sectionsSY = useMemo(() => sections.filter((s) => s.schoolYear === schoolYear), [sections, schoolYear]);
  const today = localDate();

  const stats = useMemo(() => ({
    students: activeStudentCount(students),
    sections: sectionsSY.length,
    enrolled: enrolledCount(enrollments, schoolYear),
    attendance: todayAttendance(attendance, sectionsSY.length, today),
    unassigned: unassignedCount(students, enrollments, schoolYear),
  }), [students, sectionsSY, enrollments, schoolYear, attendance, today]);

  const gradeCounts = useMemo(() => countByGrade(enrollments, schoolYear), [enrollments, schoolYear]);
  const recent = useMemo(() => recentEnrollments(enrollments, 5), [enrollments]);
  const studentsById = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);
  const sectionsById = useMemo(() => Object.fromEntries(sections.map((s) => [s.id, s])), [sections]);

  return (
    <div>
      <div style={S.plate}>
        <h1 style={S.h1}>Dashboard</h1>
        <Btn onClick={() => setPage('enroll')}>Enroll a learner</Btn>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 20 }}>
        <StatTile label="Total Students" value={stats.students} />
        <StatTile label="Sections" value={stats.sections} />
        <StatTile label="Enrolled (this SY)" value={stats.enrolled} />
        <StatTile
          label="Today's Attendance"
          value={stats.attendance.presentRate === null ? '—' : `${stats.attendance.presentRate}%`}
          hint={stats.attendance.sectionsMarked === 0 ? 'Not yet taken today' : `${stats.attendance.sectionsMarked} section${stats.attendance.sectionsMarked === 1 ? '' : 's'} marked`}
        />
        <StatTile label="Unassigned" value={stats.unassigned} onClick={() => setPage('students', { gradeFilter: UNASSIGNED, status: 'active' })} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 20, alignItems: 'start' }}>
        <Card style={{ padding: 20 }}>
          <h2 style={S.h2}>Enrolled by grade</h2>
          <GradeBarChart counts={gradeCounts} />
        </Card>

        <Card style={{ padding: 20 }}>
          <h2 style={S.h2}>Recent enrollments</h2>
          {recent.length === 0 ? (
            <p style={{ fontFamily: T.body, fontSize: 13, color: T.inkMuted }}>No enrollments yet.</p>
          ) : (
            <div>
              {recent.map((e) => {
                const student = studentsById[e.studentId];
                const section = sectionsById[e.sectionId];
                return (
                  <div key={`${e.studentId}_${e.schoolYear}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${T.border}` }}>
                    <span style={{ fontFamily: T.body, fontSize: 13, color: T.ink, fontWeight: 600 }}>{student ? fullName(student) : 'Unknown learner'}</span>
                    <span style={{ ...T.num, fontSize: 12, color: T.inkMuted }}>{section ? section.name : '—'} · {e.dateEnrolled}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function StatTile({ label, value, hint, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Card
      as={Tag}
      onClick={onClick}
      aria-label={onClick ? `${label}: ${value} students. View them.` : undefined}
      style={{
        padding: 20,
        cursor: onClick ? 'pointer' : 'default',
        ...(onClick ? { border: 'none', background: 'none', textAlign: 'left', width: '100%', font: 'inherit', display: 'block' } : {}),
      }}
    >
      <div style={{ fontFamily: T.body, fontSize: 12, fontWeight: 600, color: T.inkMuted, marginBottom: 8 }}>{label}</div>
      <div style={{ ...T.num, fontSize: 28, fontWeight: 800, color: T.ink }}>{value}</div>
      {hint && <div style={{ fontFamily: T.body, fontSize: 11, color: T.inkMuted, marginTop: 4 }}>{hint}</div>}
    </Card>
  );
}
