import { useEffect, useState } from 'react';
import { Btn, Card, EmptyState, Field, Inp } from '../../../components/ui.jsx';
import { T, S } from '../../../styles.js';
import { ROLE_LABELS, scopeLabel, sectionLabel } from '../../../../parent/src/lib/school.js';
import { assignmentFromLegacy, legacyAdviserRows, relativeAge, requestFlags } from '../../../lib/schoolAssignments.js';
import LegacyAdvisers from '../LegacyAdvisers.jsx';
import { capsName, personLabel } from '../../../lib/roster.js';

const muted = { fontSize: 13, color: T.inkMuted };
const who = personLabel;

// Oldest first. Conflicting requests offer Replace instead of Approve and cannot be bulk-selected.
export default function PendingView({ school, onUseLegacy, focusId }) {
  const { context, run, pending } = school;
  const requests = context.pendingRequests || [];
  const sections = context.sections || [];
  const disabled = pending || context.ended;
  const clean = requests.filter(r => !r.conflict).map(r => r.id);
  const cleanKey = clean.join('|');
  const [selected, setSelected] = useState(() => new Set());
  const [open, setOpen] = useState(null);
  const [reason, setReason] = useState('');
  const [failures, setFailures] = useState({});
  useEffect(() => { const ids = cleanKey.split('|'); setSelected(prev => new Set([...prev].filter(id => ids.includes(id)))); }, [cleanKey]);
  useEffect(() => { if (focusId) document.getElementById(`school-request-${focusId}`)?.focus(); }, [focusId]);
  const toggle = id => setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const allSelected = clean.length > 0 && clean.every(id => selected.has(id));
  const startReason = (id, kind) => { setOpen({ id, kind }); setReason(''); };
  const approve = r => run('resolveSchoolRoleFn', { requestId: r.id, approve: true }, `Approved ${who(r)}. They get an inbox note in the app.`);
  const approveSelected = () => run('resolveSchoolRolesFn', { requestIds: [...selected] },
    data => { const failed = data.results.filter(x => !x.ok).length; return `${data.results.length - failed} approved${failed ? `, ${failed} need attention below` : ''}.`; },
    data => { setFailures(Object.fromEntries(data.results.filter(x => !x.ok).map(x => [x.id, x.error]))); setSelected(new Set()); });
  const submitReason = (event, r) => {
    event.preventDefault();
    const text = reason.trim();
    if (!text) return;
    const done = () => { setOpen(null); setReason(''); };
    if (open.kind === 'reject') run('resolveSchoolRoleFn', { requestId: r.id, approve: false, reason: text }, `Rejected ${who(r)}'s request. They see your reason in the app.`, done);
    else run('replaceAdviserFn', { requestId: r.id, reason: text }, `${who(r)} replaced ${who(r.conflict)} as adviser.`, done);
  };
  const legacy = legacyAdviserRows(context.legacyAdvisers, context.managedAssignments);
  const legacyOpen = legacy.filter(row => !row.assigned).length;
  return <>
    <Card style={{ padding: 20, marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h3 style={{ ...S.h2, margin: 0 }}>Requests waiting for review</h3>
        {clean.length > 0 && <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={allSelected} disabled={disabled} style={{ width: 18, height: 18 }}
            onChange={() => setSelected(allSelected ? new Set() : new Set(clean))} />{`Select all without conflicts (${clean.length})`}</label>}
      </div>
      {requests.length === 0
        ? <EmptyState title="No requests waiting" hint="Teachers request access from the app's Settings." />
        : <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }}>{requests.map(r => {
          const flags = requestFlags(r);
          const section = sections.find(s => s.id === r.sectionId);
          return <li key={r.id} id={`school-request-${r.id}`} tabIndex={-1}
            style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr)', gap: '0 8px', padding: '16px 0', borderTop: `1px solid ${T.border}` }}>
            <span>{!r.conflict && <input type="checkbox" aria-label={`Select ${who(r)}`} checked={selected.has(r.id)} disabled={disabled}
              onChange={() => toggle(r.id)} style={{ width: 18, height: 18, marginTop: 2 }} />}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 10px' }}>
                <strong>{who(r)}</strong><span style={{ ...muted, overflowWrap: 'anywhere' }}>{r.email}</span><span style={muted}>{relativeAge(r.createdAt)}</span>
              </div>
              <div style={{ marginTop: 4 }}>{ROLE_LABELS[r.role]} · {scopeLabel(r, context.sections || [])}</div>
              {flags.length > 0 && <ul style={{ display: 'flex', flexWrap: 'wrap', gap: 6, listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
                {flags.map(f => <li key={f.key} className={`sims-flag sims-flag--${f.key}`}>{f.label}</li>)}</ul>}
              {failures[r.id] && <p role="alert" className="sims-feedback" style={{ marginTop: 10 }}>{failures[r.id]}</p>}
              {open?.id === r.id ? <form onSubmit={e => submitReason(e, r)} style={{ marginTop: 12 }}>
                <p style={{ fontSize: 13, margin: '0 0 8px' }}>{open.kind === 'reject' ? 'Tell the teacher why. They see this in the app.'
                  : `${who(r.conflict)} loses access to ${sectionLabel(section)} right away, and ${who(r)} becomes the adviser.`}</p>
                <Field label="Reason"><Inp autoFocus required maxLength={500} value={reason} disabled={pending} onChange={e => setReason(e.target.value)} /></Field>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <Btn type="submit" disabled={pending || !reason.trim()} style={open.kind === 'replace' ? { background: T.absent } : undefined}>
                    {pending ? 'Working…' : open.kind === 'reject' ? 'Reject request' : 'Replace adviser'}</Btn>
                  <Btn variant="ghost" type="button" disabled={pending} onClick={() => setOpen(null)}>Cancel</Btn>
                </div>
              </form> : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {r.conflict
                  ? <Btn disabled={disabled} variant="danger" onClick={() => startReason(r.id, 'replace')}>{`Replace ${who(r.conflict)}`}</Btn>
                  : <Btn disabled={disabled} onClick={() => approve(r)}>Approve</Btn>}
                <Btn variant="ghost" disabled={disabled} onClick={() => startReason(r.id, 'reject')}>Reject</Btn>
              </div>}
            </div>
          </li>;
        })}</ul>}
    </Card>
    {selected.size > 0 && <div className="school-bulk-bar" role="region" aria-label="Bulk approval">
      <span style={{ fontWeight: 600 }}>{selected.size} selected</span>
      <Btn variant="ghost" disabled={pending} onClick={() => setSelected(new Set())}>Clear</Btn>
      <Btn disabled={disabled} onClick={approveSelected}>{pending ? 'Working…' : `Approve ${selected.size} selected`}</Btn>
    </div>}
    <Card style={{ padding: 20 }}>
      <h3 style={S.h2}>Old adviser slips to confirm{legacyOpen ? ` (${legacyOpen})` : ''}</h3>
      <p style={muted}>Old adviser links grant no school access. Confirm each teacher's class, then assign.</p>
      <LegacyAdvisers rows={legacy} sections={sections} disabled={disabled}
        onUse={row => onUseLegacy({ ...assignmentFromLegacy(row), source: 'legacy', name: row.name ? capsName(row.name) : row.email })} />
    </Card>
  </>;
}
