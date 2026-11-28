import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDocResource } from '../../hooks/useCollection.js';
import { Badge, Btn, Card, EmptyState, Field, Modal } from '../../components/ui.jsx';
import { TempPassSheets } from '../../components/TempPassPrintable.jsx';
import { declineTempPassRequest, listTempPassRequests } from '../../data/tempPasses.js';
import { DECLINE_REASON_MAX } from '../../../shared/tempPassRequests.js';
import { isAdmin } from '../../lib/access.js';
import { fullName } from '../../lib/roster.js';
import { passSectionLine, previewKey } from '../../lib/tempPass.js';
import { S, T } from '../../styles.js';
import { usePassPrinting } from './usePassPrinting.js';
import { NotPreparedList, PrintButtons, PrintMessages } from './PassPrintParts.jsx';

// Adviser requests for temporary passes (spec 2026-11-27 requests): administrators, grade level
// coordinators (own grade) and logistic operators prepare, print and mark them, or decline them.
export const REASON_LABELS = { new: 'New pass', lost: 'Lost', damaged: 'Damaged' };
const BLOCKER_TEXT = {
  'not-in-class': 'No longer enrolled in the requested class',
  inactive: 'Learner is not active',
  'no-lrn': 'No LRN on record',
  'official-printed': 'Official ID already issued',
};
const FILTERS = [['pending', 'Waiting'], ['printed', 'Printed'], ['declined', 'Declined']];
const EMPTY = {
  pending: ['No requests waiting', 'Requests from class advisers appear here.'],
  printed: ['No printed requests yet', 'Requests marked as printed this school year appear here.'],
  declined: ['No declined requests', 'Requests declined this school year appear here.'],
};

// listTempPassRequests(status) as state. A reload that is overtaken by a newer one (or a newer
// status) is ignored, so a slow answer never replaces a newer list.
export function usePassRequestList(status, enabled = true) {
  const [state, setState] = useState({ status, requests: [], truncated: false, loading: enabled, error: null });
  const ticket = useRef(0);
  const reload = useCallback(async () => {
    const mine = ++ticket.current;
    setState((s) => ({ ...(s.status === status ? s : { requests: [], truncated: false }), status, loading: true, error: null }));
    // Resolves to the fresh requests, or null when the load failed or a newer one overtook it.
    try {
      const result = await listTempPassRequests(status);
      if (mine !== ticket.current) return null;
      const requests = result?.requests ?? [];
      setState({ status, requests, truncated: !!result?.truncated, loading: false, error: null });
      return requests;
    } catch (error) {
      if (mine === ticket.current) setState((s) => ({ ...s, loading: false, error }));
      return null;
    }
  }, [status]);
  useEffect(() => {
    if (!enabled) { ticket.current += 1; return; }
    reload();
  }, [enabled, reload]);
  // Rows of another status are never shown while the new ones load.
  const current = state.status === status ? state : { requests: [], truncated: false, loading: enabled, error: null };
  return { ...current, reload };
}

export const requestsTabLabel = (count, truncated = false) => (count > 0 ? `Requests · ${count}${truncated ? '+' : ''}` : 'Requests');

// Each request prints for its learner, with the learner's current section (the one the pass is placed
// in). A request whose learner or section is not loaded here cannot be prepared from this page.
export function requestTargets(requests, { studentsById, enrolled, sectionsById }) {
  return requests.flatMap((request) => {
    const student = studentsById.get(request.studentId);
    const section = sectionsById.get(enrolled.get(request.studentId)?.sectionId);
    return student && section ? [{ studentId: request.studentId, requestId: request.id, student, section }] : [];
  });
}

const callableMessage = (error, fallback) => (String(error?.code ?? '').startsWith('functions/') && error.code !== 'functions/internal' && error.message
  ? error.message : fallback);

function DeclineDialog({ request, name, onClose, onDeclined, onRefused }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const submit = async (event) => {
    event.preventDefault();
    if (lock.current) return;
    const text = reason.trim();
    if (!text) { setError('Tell the adviser why the request is declined.'); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      await declineTempPassRequest(request.id, text);
      onDeclined();
    } catch (failure) {
      setError(callableMessage(failure, 'The request could not be declined. Please try again.'));
      onRefused();
    } finally { lock.current = false; setBusy(false); }
  };
  return (
    <Modal title="Decline request?" onClose={onClose} dismissible={!busy}>
      <form onSubmit={submit} noValidate>
        <p className="sims-dialog-body">{`Request for ${name}. The adviser sees this reason in the Parent App.`}</p>
        <Field label="Reason" error={error || undefined}>
          <textarea className="sims-input" rows={3} maxLength={DECLINE_REASON_MAX} required value={reason}
            onChange={(e) => setReason(e.target.value)} autoFocus />
        </Field>
        <div className="sims-dialog-actions">
          <Btn type="button" variant="ghost" disabled={busy} onClick={onClose}>Cancel</Btn>
          <Btn type="submit" variant="danger" loading={busy}>Decline</Btn>
        </div>
      </form>
    </Modal>
  );
}

// pending: the waiting requests from usePassRequestList('pending') (IDCardsPage shares them with the
// tab label and the Temporary passes tab). onRequestsChanged reloads them.
export default function PassRequestsTab({ me, schoolYear, sections, enrollments, students, passes, pending, onRequestsChanged }) {
  const admin = isAdmin(me);
  const settingsResource = useDocResource('settings/app');
  const principalName = String(settingsResource.data?.principalName ?? '').trim();
  const principalTitle = String(settingsResource.data?.principalTitle ?? '').trim();
  const principalMissing = !settingsResource.loading && (!principalName || !principalTitle);
  const canPrepare = !settingsResource.loading && !principalMissing;

  const [filter, setFilter] = useState('pending');
  const history = usePassRequestList(filter, filter !== 'pending');
  const list = filter === 'pending' ? pending : history;
  const reloadList = filter === 'pending' ? onRequestsChanged : history.reload;

  const studentsById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const enrolled = useMemo(() => new Map(enrollments
    .filter((e) => e.status === 'enrolled' && e.schoolYear === schoolYear).map((e) => [e.studentId, e])), [enrollments, schoolYear]);
  const sectionsById = useMemo(() => new Map(sections.filter((s) => s.schoolYear === schoolYear).map((s) => [s.id, s])), [sections, schoolYear]);
  const waiting = useMemo(() => pending?.requests ?? [], [pending]);
  const targetOf = useMemo(() => new Map(requestTargets(waiting, { studentsById, enrolled, sectionsById }).map((t) => [t.requestId, t])),
    [waiting, studentsById, enrolled, sectionsById]);
  // A request that can no longer be met is declined, even when prepared (the server allows that), never printed.
  const tickable = useCallback((r) => !r.blocker && targetOf.has(r.id), [targetOf]);
  const printableIds = useMemo(() => waiting.filter(tickable).map((r) => r.id), [waiting, tickable]);

  const [picked, setPicked] = useState(() => new Set());
  const selected = useMemo(() => printableIds.filter((id) => picked.has(id)), [printableIds, picked]);
  const allSelected = printableIds.length > 0 && selected.length === printableIds.length;
  // The selection does not depend on the filter, so the filter is not part of the key.
  const selectionKey = previewKey({ sectionId: 'requests', principalName, principalTitle,
    learners: selected.map((requestId) => {
      const { studentId, student, section } = targetOf.get(requestId);
      return { id: studentId, name: fullName(student), lrn: student.lrn, requestId, photo: student.photo?.path, sectionLine: passSectionLine(section) };
    }) });

  const passesById = useMemo(() => new Map(passes.map((p) => [p.id, p])), [passes]);
  const printing = usePassPrinting({ principalName, principalTitle, passesById, selectionKey,
    onPrepared: onRequestsChanged, onMarked: onRequestsChanged });
  const { preview, preparing } = printing;
  const [declining, setDeclining] = useState(null);
  const [declined, setDeclined] = useState('');

  const toggle = (id) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setPicked(allSelected ? new Set() : new Set(printableIds));
  const prepare = () => { setDeclined(''); printing.prepare(selected.map((id) => targetOf.get(id))); };
  const nameOfRequest = (r) => {
    const student = studentsById.get(r.studentId);
    return student ? fullName(student) : r.displayName || 'A learner';
  };
  const nameOf = ({ studentId, requestId }) => {
    const r = waiting.find((x) => x.id === requestId) ?? { studentId };
    return nameOfRequest(r);
  };
  const isWaiting = filter === 'pending';
  const rows = list?.requests ?? [];

  return (
    <>
      <div className="id-cards-controls" style={{ fontFamily: T.body, color: T.ink }}>
        <Card style={{ padding: 20, marginBottom: 16 }}>
          <PrintMessages printing={printing} admin={admin} principalMissing={principalMissing} />
          {declined && <p role="status" style={{ margin: '0 0 8px', fontSize: 13 }}>{declined}</p>}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div role="group" aria-label="Show requests" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {FILTERS.map(([key, label]) => (
                <Btn key={key} variant={filter === key ? 'solid' : 'ghost'} aria-pressed={filter === key}
                  disabled={preparing} onClick={() => { setFilter(key); setDeclined(''); }}>{label}</Btn>
              ))}
            </div>
            {isWaiting && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Btn variant="ghost" disabled={printableIds.length === 0 || preparing} onClick={toggleAll}>
                  {allSelected ? 'Clear selection' : 'Select all printable'}
                </Btn>
                <PrintButtons printing={printing} count={selected.length} canPrepare={canPrepare} onPrepare={prepare} />
              </div>
            )}
          </div>
          {list?.truncated && <p style={{ margin: '10px 0 0', fontSize: 13, color: T.inkMuted }}>Only the first 200 requests are shown.</p>}
        </Card>

        <NotPreparedList preview={preview} nameOf={nameOf} />

        {list?.error ? (
          <Card style={{ padding: 20, marginBottom: 16 }}>
            <p role="alert" className="sims-feedback">Could not load the requests. Please try again.</p>
            <Btn onClick={() => reloadList?.()}>Try again</Btn>
          </Card>
        ) : list?.loading && rows.length === 0 ? (
          <div className="sims-loading" role="status"><span className="sims-sr-only">Loading requests…</span>
            <div className="sims-skeleton" aria-hidden="true"><span /><span /><span /></div></div>
        ) : rows.length === 0 ? (
          <Card style={{ padding: 20, marginBottom: 16 }}>
            <EmptyState title={EMPTY[filter][0]} hint={EMPTY[filter][1]} />
          </Card>
        ) : (
          <Card style={{ marginBottom: 16 }}>
            <div className="sims-table-scroll" role="region" aria-label="Requests" tabIndex={0}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={S.thead}>
                  {isWaiting && <th style={{ ...S.th, width: 1 }}><span className="sims-sr-only">Select</span></th>}
                  <th style={S.th}>Name</th><th style={S.th}>LRN</th><th style={S.th}>Section</th><th style={S.th}>Reason</th>
                  <th style={S.th}>Requested by</th><th style={S.th}>Note</th><th style={S.th}>Photo</th>
                  {isWaiting && <th style={S.th}><span className="sims-sr-only">Actions</span></th>}
                </tr></thead>
                <tbody>{rows.map((r) => {
                  const name = nameOfRequest(r);
                  const suggest = isWaiting && !!r.blocker;
                  const missing = isWaiting && !suggest && !targetOf.has(r.id);
                  return (
                    <tr key={r.id}>
                      {isWaiting && <td style={S.td}>
                        <input type="checkbox" aria-label={`Select ${name}`} checked={selected.includes(r.id)}
                          disabled={!tickable(r) || preparing} onChange={() => toggle(r.id)} />
                      </td>}
                      <td style={S.tdStrong}>
                        {name}
                        {(suggest || r.prepared || missing) && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 4, fontWeight: 400 }}>
                            {r.prepared && isWaiting && <Badge tone="info">Prepared</Badge>}
                            {suggest && <Badge tone="warning">Decline suggested</Badge>}
                            {r.blocker && isWaiting && <span style={{ color: T.inkMuted }}>{BLOCKER_TEXT[r.blocker] ?? 'Can no longer be met'}</span>}
                            {missing && <span style={{ color: T.inkMuted }}>Learner record not available here</span>}
                          </div>
                        )}
                      </td>
                      <td style={{ ...S.td, ...T.num }}>{r.lrn || '—'}</td>
                      <td style={S.td}>{`Grade ${r.gradeLevel} - ${r.sectionName || '—'}`}</td>
                      <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{REASON_LABELS[r.reason] ?? '—'}</td>
                      <td style={S.td}>{r.requestedByName || '—'}</td>
                      <td style={{ ...S.td, minWidth: 180, maxWidth: 320, overflowWrap: 'break-word' }}>{r.note || '—'}</td>
                      <td style={S.td}>{r.hasPhoto ? 'Yes' : <Badge tone="neutral">No photo</Badge>}</td>
                      {isWaiting && <td style={S.tdActions}>
                        {(!r.prepared || r.blocker) && (
                          <Btn variant="ghost-danger" aria-label={`Decline the request for ${name}`} disabled={preparing}
                            onClick={() => { setDeclined(''); setDeclining(r); }}>Decline</Btn>
                        )}
                      </td>}
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {preview && preview.items.length > 0 && <TempPassSheets passes={preview.items} />}
      {declining && (
        <DeclineDialog request={declining} name={nameOfRequest(declining)} onClose={() => setDeclining(null)}
          onDeclined={() => { setDeclining(null); setDeclined('Request declined. The adviser was notified.'); onRequestsChanged?.(); }}
          onRefused={() => onRequestsChanged?.()} />
      )}
    </>
  );
}
