import { useEffect, useMemo } from 'react';
import { Btn, ResourceState } from '../components/ui.jsx';
import NavIcon from '../components/NavIcon.jsx';
import AttentionPanel from '../components/dashboard/AttentionPanel.jsx';
import WidgetDrawer from '../components/dashboard/WidgetDrawer.jsx';
import { useDashboardData } from '../components/dashboard/useDashboardData.js';
import { useDashboardPanel } from '../hooks/useDashboardPanel.js';
import KpiStrip from '../components/dashboard/widgets/KpiStrip.jsx';
import { EnrollmentCard, EnrollmentDetail } from '../components/dashboard/widgets/EnrollmentWidget.jsx';
import { CoverageCard, CoverageDetail } from '../components/dashboard/widgets/CoverageWidget.jsx';
import { attendanceTally, unassignedCount } from '../lib/dashboardStats.js';
import { canOpen } from '../lib/access.js';
import { UNASSIGNED } from '../lib/constants.js';
import '../dashboard.css';

export default function DashboardPage({ me, schoolYear, setPage }) {
  const data = useDashboardData({ me, schoolYear });
  const { panel, open, close } = useDashboardPanel();
  const { today, admin } = data;
  const link = (label, page, params) => (canOpen(me, page) ? { label, page, params } : null);
  const takeAttendance = (section) => setPage('attendance', { attendanceEntry: { sectionId: section.id, date: today } });
  const todayTally = useMemo(() => attendanceTally({ roster: data.rosterMap, attendance: data.attendance, schoolYear, dates: [today] }),
    [data.rosterMap, data.attendance, schoolYear, today]);
  const card = (id) => ({ data, expanded: panel === id, onExpand: () => open(id) });
  const roster = data.resources.roster;
  const drawers = {
    enrollment: { title: 'Enrollment by grade', link: link('Open Enrollment', 'enroll'), resources: roster, body: <EnrollmentDetail data={data} /> },
    coverage: { title: 'Attendance coverage', link: link('Open Attendance', 'attendance'), resources: roster, body: <CoverageDetail data={data} onTakeAttendance={takeAttendance} /> },
  };
  // A panel id with no drawer (not built yet, or drifted) counts as closed; clean it out of the URL.
  const drawer = panel && Object.hasOwn(drawers, panel) ? drawers[panel] : null;
  const missingDrawer = Boolean(panel) && !drawer;
  useEffect(() => { if (missingDrawer) close(); }, [missingDrawer, close]);
  const dateLabel = new Date(`${today}T12:00:00`).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return <div className="sims-dashboard">
    <div className="sims-heading">
      <div><h1>Your school day, at a glance.</h1><p className="sims-dashboard-date">{dateLabel}</p></div>
      {admin && <Btn onClick={() => setPage('enroll')}>Enroll a learner <NavIcon name="enroll" size={17} /></Btn>}
    </div>
    <div className="sims-dash-layout">
      <div className="sims-dash-main">
        <ResourceState resources={roster} label="dashboard summary" inline>
          <AttentionPanel unassigned={unassignedCount(data.students, data.enrollments, schoolYear)} pendingSections={data.coverage.pendingSections}
            totalSections={data.coverage.totalSections} date={today} showUnassigned={admin}
            onUnassigned={() => setPage('students', { gradeFilter: UNASSIGNED, status: 'active' })} onSection={takeAttendance} />
          <KpiStrip data={data} todayRate={todayTally.days[0]?.rate ?? null} onNavigate={setPage} onOpenPanel={open} />
        </ResourceState>
        <div className="sims-dash-row is-two">
          <EnrollmentCard {...card('enrollment')} />
        </div>
        <div className="sims-dash-row is-three">
          <CoverageCard {...card('coverage')} onTakeAttendance={takeAttendance} />
        </div>
      </div>
    </div>
    {drawer && <WidgetDrawer title={drawer.title} pageLink={drawer.link} resources={drawer.resources} onNavigate={setPage} onClose={close}>{drawer.body}</WidgetDrawer>}
  </div>;
}
