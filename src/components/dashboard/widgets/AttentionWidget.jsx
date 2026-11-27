import WidgetCard from '../WidgetCard.jsx';
import { ListRow } from '../parts.jsx';
import { EmptyState } from '../../ui.jsx';
import { fullName } from '../../../lib/roster.js';
import { unassignedStudents } from '../../../lib/dashboardStats.js';

const ICON = { unassigned: 'students', attendance: 'attendance', requests: 'accounts', idcards: 'idcards' };
const LIMIT = 10;
const countText = (q) => (q.truncated ? `${q.count}+` : q.count.toLocaleString());
const caughtUp = <EmptyState title="All caught up" hint="Nothing is waiting on you today." />;

// The badge text is a bare count: the row's visible label already names it, so it is announced once.
const CountText = ({ q }) => <span className="sims-count-badge">{countText(q)}</span>;

// Caption for a list cut to the first LIMIT entries, so the cut is never silent.
const MoreNote = ({ total }) => (total > LIMIT ? <p className="sims-widget-note">Showing {LIMIT} of {total.toLocaleString()}</p> : null);

export function AttentionCard({ data, queues, expanded, onExpand, onQueue }) {
  return <WidgetCard title="Needs attention" subtitle="Queues waiting on staff" expanded={expanded} onExpand={onExpand}
    resources={[...data.resources.roster, ...data.resources.idCards]} label="attention queues">
    {queues.length
      ? <ul className="sims-list">{queues.map((q) => <li key={q.id}>
        <ListRow icon={ICON[q.id]} title={q.label} action={<CountText q={q} />} onClick={() => onQueue(q.id)} />
      </li>)}</ul>
      : caughtUp}
  </WidgetCard>;
}

export function AttentionDetail({ data, queues, onQueue, onTakeAttendance }) {
  if (!queues.length) return caughtUp;
  const byId = Object.fromEntries(queues.map((q) => [q.id, q]));
  const unassigned = byId.unassigned ? unassignedStudents(data.students, data.enrollments, data.schoolYear) : [];
  const cards = data.idCardIds.map((id) => data.studentsById[id]).filter(Boolean);
  const pending = data.coverage.pendingSections;
  return <>
    {byId.unassigned && <section className="sims-drawer-section"><h3>{byId.unassigned.label} ({unassigned.length})</h3>
      <ul className="sims-list">{unassigned.slice(0, LIMIT).map((s) => <li key={s.id} className="sims-list-static"><strong>{fullName(s)}</strong></li>)}</ul>
      <MoreNote total={unassigned.length} />
      <ListRow title="Review unassigned learners" action="Open Students" onClick={() => onQueue('unassigned')} />
    </section>}
    {byId.attendance && <section className="sims-drawer-section"><h3>{byId.attendance.label} ({pending.length})</h3>
      <ul className="sims-list">{pending.slice(0, LIMIT).map((s) => <li key={s.id}>
        <ListRow title={s.name} meta={`Grade ${s.gradeLevel}${s.strand ? ` · ${s.strand}` : ''}`} action="Take attendance" onClick={() => onTakeAttendance(s)} />
      </li>)}</ul>
      <MoreNote total={pending.length} />
      <ListRow title="Open attendance coverage" action="See every section" onClick={() => onQueue('attendance')} />
    </section>}
    {byId.requests && <section className="sims-drawer-section"><h3>{byId.requests.label}</h3>
      <ListRow title={`${countText(byId.requests)} waiting for a decision`} action="Open Learner requests" onClick={() => onQueue('requests')} />
    </section>}
    {byId.idcards && <section className="sims-drawer-section"><h3>{byId.idcards.label} ({data.idCardIds.length})</h3>
      <ul className="sims-list">{cards.slice(0, LIMIT).map((s) => <li key={s.id} className="sims-list-static"><strong>{fullName(s)}</strong></li>)}</ul>
      <MoreNote total={cards.length} />
      <ListRow title="Print the waiting cards" action="Open ID Cards" onClick={() => onQueue('idcards')} />
    </section>}
  </>;
}
