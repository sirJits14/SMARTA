import { Fragment, useState } from 'react';
import { Btn, Card, EmptyState, Field, Inp, Sel } from '../../../components/ui.jsx';
import { T, S } from '../../../styles.js';
import { ROLE_LABELS, sectionLabel } from '../../../../parent/src/lib/school.js';
import { assignmentCsvRows, filterAssignments, shortDate } from '../../../lib/schoolAssignments.js';
import { Table } from '../RequestsTab.jsx';
import { downloadCsv } from './downloadCsv.js';
import OpenedTag from './OpenedTag.jsx';

const keyOf = item => `${item.uid}-${item.role}-${item.sectionId || item.gradeLevel}`;

export default function AssignmentsView({ school }) {
  const { context, run, pending } = school;
  const sections = context.sections || [];
  const all = context.managedAssignments || [];
  const [filters, setFilters] = useState({ text: '', grade: '', role: '', status: '' });
  const [revoking, setRevoking] = useState(null);
  const [reason, setReason] = useState('');
  const items = filterAssignments(all, filters, sections);
  const grades = [...new Set(sections.map(s => Number(s.gradeLevel)))].sort((a, b) => a - b);
  const set = (key, value) => setFilters(f => ({ ...f, [key]: value }));
  const scope = item => (item.sectionId ? sectionLabel(sections.find(s => s.id === item.sectionId)) : `Grade ${item.gradeLevel}`);
  const revoke = (event, item) => {
    event.preventDefault();
    if (!reason.trim()) return;
    run('revokeSchoolRoleFn', { uid: item.uid, role: item.role, ...(item.sectionId ? { sectionId: item.sectionId } : { gradeLevel: item.gradeLevel }), reason: reason.trim() },
      'Assignment revoked.', () => { setRevoking(null); setReason(''); });
  };
  return <Card style={{ padding: 20 }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '0 14px', alignItems: 'end' }}>
      <Field label="Search"><Inp type="search" placeholder="Name, email or section" value={filters.text} onChange={e => set('text', e.target.value)} /></Field>
      <Field label="Grade"><Sel value={filters.grade} onChange={e => set('grade', e.target.value)}>
        <option value="">All grades</option>{grades.map(g => <option key={g} value={g}>Grade {g}</option>)}</Sel></Field>
      <Field label="Responsibility"><Sel value={filters.role} onChange={e => set('role', e.target.value)}>
        <option value="">All</option>{Object.entries(ROLE_LABELS).map(([role, label]) => <option key={role} value={role}>{label}</option>)}</Sel></Field>
      <Field label="Status"><Sel value={filters.status} onChange={e => set('status', e.target.value)}>
        <option value="">All</option><option value="opened">Opened</option><option value="not_opened">Not opened yet</option></Sel></Field>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
      <span role="status" style={{ fontSize: 13, color: T.inkMuted }}>{items.length} of {all.length} assignments</span>
      <Btn variant="ghost" disabled={!items.length} onClick={() => downloadCsv(`school-assignments-${context.schoolYear}.csv`, assignmentCsvRows(items, sections))}>Export CSV</Btn>
    </div>
    {items.length === 0
      ? <EmptyState title={all.length ? 'No assignments match' : 'No assignments yet'} hint={all.length ? 'Clear a filter to see more.' : 'Approve a request or assign a role to start.'} />
      : <Table head={['Teacher', 'Responsibility', 'Scope', 'Since', 'Status', 'Action']} rows={items.map(item => {
        const key = keyOf(item);
        return <Fragment key={key}>
          <tr>
            <td style={S.td}><strong>{item.displayName || item.email || item.uid}</strong><br />
              <span style={{ fontSize: 12, color: T.inkMuted, overflowWrap: 'anywhere' }}>{item.email}</span></td>
            <td style={S.td}>{ROLE_LABELS[item.role]}</td>
            <td style={S.td}>{scope(item)}</td>
            <td style={S.td}>{shortDate(item.assignedAt) || '—'}{item.assignedBy && <><br /><span style={{ fontSize: 12, color: T.inkMuted }}>by {item.assignedBy}</span></>}</td>
            <td style={S.td}><OpenedTag item={item} /></td>
            <td style={S.td}><Btn variant="ghost" disabled={pending || context.ended} style={{ padding: '6px 14px' }} aria-expanded={revoking === key}
              onClick={() => { setRevoking(revoking === key ? null : key); setReason(''); }}>Revoke</Btn></td>
          </tr>
          {revoking === key && <tr><td colSpan={6} style={S.td}><form onSubmit={e => revoke(e, item)}>
            <p style={{ fontSize: 13, margin: '0 0 8px' }}>Revoke {item.displayName || item.email}'s {ROLE_LABELS[item.role]} role for {scope(item)}? Access ends immediately.</p>
            <Field label="Reason"><Inp autoFocus required maxLength={500} value={reason} disabled={pending} onChange={e => setReason(e.target.value)} /></Field>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn type="submit" disabled={pending || !reason.trim()} style={{ background: T.absent }}>{pending ? 'Working…' : 'Revoke assignment'}</Btn>
              <Btn variant="ghost" type="button" disabled={pending} onClick={() => setRevoking(null)}>Cancel</Btn>
            </div>
          </form></td></tr>}
        </Fragment>;
      })} />}
  </Card>;
}
