import { useEffect, useMemo } from 'react';
import { Btn, ResourceState } from '../components/ui.jsx';
import NavIcon from '../components/NavIcon.jsx';
import WidgetDrawer from '../components/dashboard/WidgetDrawer.jsx';
import { useDashboardData } from '../components/dashboard/useDashboardData.js';
import { useDashboardPanel } from '../hooks/useDashboardPanel.js';
import KpiStrip from '../components/dashboard/widgets/KpiStrip.jsx';
import { EnrollmentCard, EnrollmentDetail } from '../components/dashboard/widgets/EnrollmentWidget.jsx';
import { CoverageCard, CoverageDetail } from '../components/dashboard/widgets/CoverageWidget.jsx';
import { AttendanceCard, AttendanceDetail } from '../components/dashboard/widgets/AttendanceWidget.jsx';
import { SexCard, SexDetail } from '../components/dashboard/widgets/SexWidget.jsx';
import { AttentionCard, AttentionDetail } from '../components/dashboard/widgets/AttentionWidget.jsx';
import { attendanceTally, attentionQueues, unassignedCount } from '../lib/dashboardStats.js';
import { isWeekend } from '../lib/dates.js';
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
  const queues = attentionQueues({
    admin, canRequests: data.canRequests,
    unassigned: unassignedCount(data.students, data.enrollments, schoolYear),
    pendingSections: isWeekend(today) ? 0 : data.coverage.pendingSections.length,
    requests: data.requests, idCards: data.idCardIds.length,
  });
  const onQueue = (id) => {
    if (id === 'unassigned') setPage('students', { gradeFilter: UNASSIGNED, status: 'active' });
    else if (id === 'attendance') open('coverage');
    else if (id === 'requests') setPage('learnerRequests');
    else if (id === 'idcards') setPage('idcards');
  };
  const card = (id) => ({ data, expanded: panel === id, onExpand: () => open(id) });
  const roster = data.resources.roster;
  const drawers = {
    enrollment: { title: 'Enrollment by grade', link: link('Open Enrollment', 'enroll'), resources: roster, body: <EnrollmentDetail data={data} /> },
    coverage: { title: 'Attendance coverage', link: link('Open Attendance', 'attendance'), resources: roster, body: <CoverageDetail data={data} onTakeAttendance={takeAttendance} /> },
    attendance: { title: 'Weekly attendance', link: link('Open Attendance', 'attendance'), resources: roster, body: <AttendanceDetail data={data} /> },
    sex: { title: 'Learners by sex', link: link('Open Students', 'students'), resources: roster, body: <SexDetail data={data} /> },
    attention: { title: 'Needs attention', link: null, resources: [...roster, ...data.resources.idCards],
      body: <AttentionDetail data={data} queues={queues} onQueue={(id) => { close(); onQueue(id); }} onTakeAttendance={takeAttendance} /> },
  };
  // A panel id with no drawer (not built yet, or drifted) counts as closed; clean it out of the URL.
  const drawer = panel && Object.prototype.hasOwnProperty.call(drawers, panel) ? drawers[panel] : null;
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
          <KpiStrip data={data} todayRate={todayTally.days[0]?.rate ?? null} onNavigate={setPage} onOpenPanel={open} />
        </ResourceState>
        <div className="sims-dash-row is-two">
          <EnrollmentCard {...card('enrollment')} />
          <AttendanceCard {...card('attendance')} />
        </div>
        <div className="sims-dash-row is-three">
          <SexCard {...card('sex')} />
          <CoverageCard {...card('coverage')} onTakeAttendance={takeAttendance} />
          <AttentionCard {...card('attention')} queues={queues} onQueue={onQueue} />
        </div>
      </div>
    </div>
    {drawer && <WidgetDrawer title={drawer.title} pageLink={drawer.link} resources={drawer.resources} onNavigate={setPage} onClose={close}>{drawer.body}</WidgetDrawer>}
  </div>;
}
