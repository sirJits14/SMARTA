import { useMemo, useState } from 'react';
import { useCollectionResource } from '../hooks/useCollection.js';
import { announcements } from '../data/announcements.js';
import { TABS, tabOf, postsForTab, audienceLabel, pushStatusText } from '../lib/announcements.js';
import { coversPostKeys, toMillis } from '../../shared/announcements.js';
import { T, S } from '../styles.js';
import { Btn, Card, Confirm, EmptyState, ResourceState, EditorResources } from '../components/ui.jsx';
import AnnouncementForm from './announcements/AnnouncementForm.jsx';

const when = (t) => {
  const ms = toMillis(t);
  return ms == null ? '—' : new Date(ms).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const EMPTY = {
  live: ['No published announcements', 'Post one with the New announcement button.'],
  scheduled: ['Nothing scheduled', 'Scheduled announcements wait here until they go out.'],
  ended: ['Nothing has ended yet', 'Unpublished and expired announcements are kept here.'],
};

export default function AnnouncementsPage({ me }) {
  const resource = useCollectionResource('announcements');
  const posts = resource.data;
  const [tab, setTab] = useState('live');
  const [form, setForm] = useState(null);       // {} = new, post = edit
  const [pending, setPending] = useState(null); // { kind: 'unpublish'|'delete', post }
  const rows = useMemo(() => postsForTab(posts, tab), [posts, tab]);
  const counts = useMemo(() => Object.fromEntries(TABS.map(([k]) => [k, posts.filter((p) => tabOf(p) === k).length])), [posts]);
  const mine = (p) => coversPostKeys(me, p.audienceKeys);
  const resources = [resource];

  return (
    <EditorResources resources={resources}><div>
      <ResourceState resources={resources} label="announcements">
        <div className="sims-heading" style={S.plate}>
          <h1 style={S.h1}>Announcements</h1>
          <Btn onClick={() => setForm({})}>New announcement</Btn>
        </div>
        <div role="tablist" aria-label="Announcement status" style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
          {TABS.map(([key, label]) => {
            const active = tab === key;
            return (
              <button key={key} role="tab" aria-selected={active} onClick={() => setTab(key)} style={{
                fontFamily: T.body, fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
                cursor: 'pointer', padding: '9px 18px', borderRadius: T.pill, border: 'none',
                background: active ? T.primary : 'transparent', color: active ? '#fff' : T.inkMuted,
              }}>{label} ({counts[key]})</button>
            );
          })}
        </div>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {rows.length === 0 ? <EmptyState title={EMPTY[tab][0]} hint={EMPTY[tab][1]} /> : (
            <div className="sims-table-scroll" role="region" aria-label="Announcements" tabIndex={0}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={S.thead}>{['Title', 'Audience', tab === 'scheduled' ? 'Goes out' : 'Published', 'Expires', 'Author', 'Push', ''].map((h) => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>{rows.map((p) => (
                <tr key={p.id}>
                  <td style={{ ...S.td, fontWeight: 600 }}>{p.pinned && <span style={{ color: T.primary, fontWeight: 700 }}>Pinned · </span>}{p.title}{p.editedAt && <span style={{ color: T.inkMuted, fontWeight: 400 }}> (edited)</span>}</td>
                  <td style={S.td}>{audienceLabel(p.audienceKeys)}</td>
                  <td style={S.td}>{when(tab === 'scheduled' ? p.publishAt : p.publishedAt)}</td>
                  <td style={S.td}>{p.expiresAt ? when(p.expiresAt) : '—'}</td>
                  <td style={S.td}>{p.createdBy?.name || '—'}</td>
                  <td style={{ ...S.td, color: p.pushResult && ['interrupted', 'failed'].includes(p.pushResult.status) ? T.absent : T.ink }}>{pushStatusText(p)}</td>
                  <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {mine(p) && tab !== 'ended' && <Btn variant="ghost" onClick={() => setForm(p)} style={{ marginRight: 6 }}>Edit</Btn>}
                    {mine(p) && tab === 'live' && <Btn variant="ghost" onClick={() => setPending({ kind: 'unpublish', post: p })} style={{ color: T.absent, borderColor: T.absent }}>Unpublish</Btn>}
                    {mine(p) && tab === 'scheduled' && <Btn variant="ghost" onClick={() => setPending({ kind: 'delete', post: p })} style={{ color: T.absent, borderColor: T.absent }}>Delete</Btn>}
                    {!mine(p) && <span style={{ color: T.inkMuted }}>View only</span>}
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
      </ResourceState>
      {form && <AnnouncementForm me={me} editing={form.id ? form : null} posts={posts} onClose={() => setForm(null)} />}
      {pending && (
        <Confirm
          title={pending.kind === 'unpublish' ? 'Unpublish announcement' : 'Delete announcement'}
          label={pending.kind === 'unpublish' ? 'Unpublish' : 'Delete'}
          message={pending.kind === 'unpublish'
            ? `Unpublish "${pending.post.title}"? It disappears from every parent's Notices tab right away. This can't be undone.`
            : `Delete the scheduled announcement "${pending.post.title}"? It will not go out.`}
          onYes={async () => { await (pending.kind === 'unpublish' ? announcements.unpublish(pending.post, me) : announcements.remove(pending.post)); setPending(null); }}
          onNo={() => setPending(null)} />
      )}
    </div></EditorResources>
  );
}
