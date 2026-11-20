import WidgetCard from '../WidgetCard.jsx';
import { ListRow } from '../parts.jsx';
import { CountBadge, EmptyState } from '../../ui.jsx';
import NavIcon from '../../NavIcon.jsx';
import { fullName } from '../../../lib/roster.js';
import { unassignedStudents } from '../../../lib/dashboardStats.js';

const ICON = { unassigned: 'students', attendance: 'attendance', requests: 'accounts', idcards: 'idcards' };
const countText = (q) => (q.truncated ? `${q.count}+` : q.count.toLocaleString());

export function AttentionCard({ data, queues, expanded, onExpand, onQueue }) {
  return <WidgetCard title="Needs attention" subtitle="Queues waiting on staff" expanded={expanded} onExpand={onExpand}
    resources={[...data.resources.roster, ...data.resources.idCards]} label="attention queues">
    {queues.length
      ? <ul className="sims-list">{queues.map((q) => <li key={q.id}>
        <button type="button" className="sims-list-row" onClick={() => onQueue(q.id)}>
          <span className="sims-list-main"><NavIcon name={ICON[q.id]} size={16} /><strong>{q.label}</strong></span>
          <span className="sims-list-action"><CountBadge count={countText(q)} label={q.label.toLowerCase()} /><NavIcon name="chevronRight" size={16} /></span>
        </button>
      </li>)}</ul>
      : <EmptyState title="All caught up" hint="Nothing is waiting on you today." />}
  </WidgetCard>;
}

export function AttentionDetail({ data, queues, onQueue, onTakeAttendance }) {
  const ids = new Set(queues.map((q) => q.id));
  if (!queues.length) return <EmptyState title="All caught up" hint="Nothing is waiting on you today." />;
  const unassigned = ids.has('unassigned') ? unassignedStudents(data.students, data.enrollments, data.schoolYear) : [];
  const cards = data.idCardIds.map((id) => data.studentsById[id]).filter(Boolean);
  return <>
    {ids.has('unassigned') && <section className="sims-drawer-section"><h3>Learners without a section ({unassigned.length})</h3>
      <ul className="sims-list">{unassigned.slice(0, 10).map((s) => <li key={s.id} className="sims-list-static"><strong>{fullName(s)}</strong></li>)}</ul>
      <ListRow title="Review unassigned learners" action="Open Students" onClick={() => onQueue('unassigned')} />
    </section>}
    {ids.has('attendance') && <section className="sims-drawer-section"><h3>Sections without attendance today ({data.coverage.pendingSections.length})</h3>
      <ul className="sims-list">{data.coverage.pendingSections.slice(0, 10).map((s) => <li key={s.id}>
        <ListRow title={s.name} meta={`Grade ${s.gradeLevel}${s.strand ? ` · ${s.strand}` : ''}`} action="Take attendance" onClick={() => onTakeAttendance(s)} />
      </li>)}</ul>
    </section>}
    {ids.has('requests') && <section className="sims-drawer-section"><h3>Learner requests waiting</h3>
      <ListRow title={`${countText(queues.find((q) => q.id === 'requests'))} waiting for a decision`} action="Open Learner requests" onClick={() => onQueue('requests')} />
    </section>}
    {ids.has('idcards') && <section className="sims-drawer-section"><h3>ID cards waiting to print ({data.idCardIds.length})</h3>
      <ul className="sims-list">{cards.slice(0, 10).map((s) => <li key={s.id} className="sims-list-static"><strong>{fullName(s)}</strong></li>)}</ul>
      <ListRow title="Print the waiting cards" action="Open ID Cards" onClick={() => onQueue('idcards')} />
    </section>}
  </>;
}
