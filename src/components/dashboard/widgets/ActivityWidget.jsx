import { useMemo, useState } from 'react';
import WidgetCard from '../WidgetCard.jsx';
import { Segmented } from '../parts.jsx';
import { EmptyState } from '../../ui.jsx';
import NavIcon from '../../NavIcon.jsx';
import { fullName } from '../../../lib/roster.js';
import { shortDate } from '../../../lib/schoolAssignments.js';
import { toMillis } from '../../../../shared/announcements.js';
import { recentActivity, sectionTitle } from '../../../lib/dashboardStats.js';
import { dayLabel } from '../../../lib/dates.js';

function Sentence({ item, data }) {
  if (item.kind === 'enrollment') {
    const student = data.studentsById[item.enrollment.studentId];
    return <><strong>{student ? fullName(student) : 'Unavailable learner'}</strong> enrolled in {sectionTitle(data.sectionsById[item.enrollment.sectionId])}</>;
  }
  const by = item.post.createdBy?.name ? ` by ${item.post.createdBy.name}` : '';
  return <><strong>{item.post.title}</strong> {item.scheduled ? `scheduled for ${shortDate(toMillis(item.post.publishAt))}` : 'published'}{by}</>;
}

function Timeline({ items, data }) {
  return <ol className="sims-timeline">{items.map((item) => <li key={item.key}>
    <span className="sims-timeline-icon" aria-hidden="true"><NavIcon name={item.kind === 'post' ? 'announcements' : 'enroll'} size={14} /></span>
    <div><p><Sentence item={item} data={data} /></p><time dateTime={item.day}>{dayLabel(item.day, { month: 'short', day: 'numeric', year: 'numeric' })}</time></div>
  </li>)}</ol>;
}

const useItems = (data, kind, limit) => useMemo(
  () => recentActivity({ enrollments: data.enrollments, posts: data.posts, schoolYear: data.schoolYear, kind, limit }),
  [data.enrollments, data.posts, data.schoolYear, kind, limit],
);
const LIMIT = 50;
const EMPTY = ['No recent activity', 'Enrollments and announcements will appear here.'];

export function ActivityCard({ data, expanded, onExpand }) {
  const items = useItems(data, 'all', 6);
  return <WidgetCard title="Recent activity" expanded={expanded} onExpand={onExpand}
    resources={[...data.resources.roster, ...data.resources.posts]} label="recent activity">
    {items.length ? <Timeline items={items} data={data} /> : <EmptyState title={EMPTY[0]} hint={EMPTY[1]} />}
  </WidgetCard>;
}

export function ActivityDetail({ data }) {
  const [kind, setKind] = useState('all');
  const all = useItems(data, kind, Number.MAX_SAFE_INTEGER);
  const items = all.slice(0, LIMIT);
  return <>
    <Segmented label="Activity type" value={kind} onChange={setKind} options={[['all', 'All'], ['enrollment', 'Enrollments'], ['post', 'Posts']]} />
    {items.length ? <Timeline items={items} data={data} /> : <EmptyState title={EMPTY[0]} hint={EMPTY[1]} />}
    {all.length > LIMIT && <p className="sims-widget-note">Showing {LIMIT} of {all.length.toLocaleString()}</p>}
  </>;
}
