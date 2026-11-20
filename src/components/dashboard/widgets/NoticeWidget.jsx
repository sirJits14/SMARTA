import { useState } from 'react';
import WidgetCard, { WidgetFilter } from '../WidgetCard.jsx';
import { Segmented } from '../parts.jsx';
import { Badge, EmptyState } from '../../ui.jsx';
import { audienceLabel } from '../../../lib/announcements.js';
import { shortDate } from '../../../lib/schoolAssignments.js';
import { noticePosts, postDate, postState } from '../../../lib/dashboardStats.js';

const LIMIT = 50;
const EMPTY = {
  all: ['No current announcements', 'Published and scheduled announcements appear here.'],
  published: ['Nothing published', 'Live announcements appear here.'],
  scheduled: ['Nothing scheduled', 'Scheduled announcements appear here.'],
  ended: ['Nothing has ended', 'Unpublished and expired announcements appear here.'],
};

export function NoticeList({ posts, nowMs, preview = false }) {
  return <ul className="sims-notices">{posts.map((p) => {
    const state = postState(p, nowMs);
    return <li key={p.id} className="sims-notice">
      <div className="sims-notice-title">{p.title}
        {p.pinned && <Badge tone="accent">Pinned</Badge>}
        {state === 'scheduled' && <Badge tone="info">Scheduled</Badge>}
        {state === 'ended' && <Badge>Ended</Badge>}
      </div>
      <div><span className="sims-notice-k">Audience</span><span className="sims-notice-v">{audienceLabel(p.audienceKeys, p.audience)}</span></div>
      <div><span className="sims-notice-k">{state === 'scheduled' ? 'Goes out' : 'Date'}</span><span className="sims-notice-v">{shortDate(postDate(p)) || '\u2014'}</span></div>
      <div><span className="sims-notice-k">Created by</span><span className="sims-notice-v">{p.createdBy?.name || '\u2014'}</span></div>
      {preview && p.body && <p className="sims-notice-preview">{p.body}</p>}
    </li>;
  })}</ul>;
}

export function NoticeCard({ data, expanded, onExpand }) {
  const [status, setStatus] = useState('all');
  const posts = noticePosts(data.posts, { status, nowMs: data.nowMs, limit: 4 });
  return <WidgetCard title="Notice board" subtitle="Announcements to families and staff"
    filter={<WidgetFilter label="Status" value={status} onChange={setStatus} options={[['all', 'All current'], ['published', 'Published'], ['scheduled', 'Scheduled']]} />}
    expanded={expanded} onExpand={onExpand} resources={data.resources.posts} label="announcements">
    {posts.length ? <NoticeList posts={posts} nowMs={data.nowMs} /> : <EmptyState title={EMPTY[status][0]} hint={EMPTY[status][1]} />}
  </WidgetCard>;
}

export function NoticeDetail({ data }) {
  const [status, setStatus] = useState('all');
  const all = noticePosts(data.posts, { status, nowMs: data.nowMs, limit: Number.MAX_SAFE_INTEGER });
  const posts = all.slice(0, LIMIT);
  return <>
    <Segmented label="Announcement status" value={status} onChange={setStatus}
      options={[['all', 'All current'], ['published', 'Published'], ['scheduled', 'Scheduled'], ['ended', 'Ended']]} />
    {posts.length ? <NoticeList posts={posts} nowMs={data.nowMs} preview /> : <EmptyState title={EMPTY[status][0]} hint={EMPTY[status][1]} />}
    {all.length > LIMIT && <p className="sims-widget-note">Showing {LIMIT} of {all.length.toLocaleString()}</p>}
  </>;
}
