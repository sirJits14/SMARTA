import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { useCollectionResource, useSchoolYearEnrollments } from '../../hooks/useCollection.js';
import { usePrintReadiness } from '../../hooks/usePrintReadiness.js';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { ActionFeedback, ResourceState, Btn, Inp, Sel, Field, Card, EmptyState, Confirm } from '../../components/ui.jsx';
import ActivationSlipsPrintable from '../../components/ActivationSlipsPrintable.jsx';
import SlipPrintControls, { useSlipPaper, PORTAL_URL } from '../../components/SlipPrintControls.jsx';
import { call } from '../../data/guardians.js';
import { addToSlipBatch, removeFromSlipBatch, clearSlipBatch } from '../../data/slipBatch.js';
import { enrolledEntries, groupBySection } from '../../lib/idCardQueue.js';
import { MAX_BATCH_ISSUE, OTHER_REASON, SLIP_BATCH_REASONS, batchReason, issueButtonLabel, splitSlipBatch } from '../../lib/slipBatch.js';
import { slipSheetFillLabel } from '../../lib/slipLayout.js';
import { issuedSummary } from '../../lib/slipIssue.js';
import { buildLearnerIndex, searchLearners } from '../../lib/search.js';
import { fullName } from '../../lib/roster.js';
import { T } from '../../styles.js';

const sectionLabel = (s) => `Grade ${s.gradeLevel} - ${s.name}${s.strand ? ` · ${s.strand}` : ''}`;
const SEARCH_LIMIT = 8;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const row = { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13, flexWrap: 'wrap' };
const reasonTag = { fontSize: 11, fontWeight: 600, color: T.inkMuted, border: `1px solid ${T.border}`, borderRadius: T.pill, padding: '1px 8px' };

export default function SlipBatchTab({ me, schoolYear, onIssuingChange }) {
  const studentsResource = useCollectionResource('students');
  const enrollmentsResource = useSchoolYearEnrollments(schoolYear);
  const sectionsResource = useCollectionResource('sections');
  const batchResource = useCollectionResource('slip_batch');
  const resources = [studentsResource, enrollmentsResource, sectionsResource, batchResource];
  if (resources.some((r) => r.loading || r.error)) return <ResourceState resources={resources} />;
  return <SlipBatch me={me} schoolYear={schoolYear} onIssuingChange={onIssuingChange} students={studentsResource.data}
    enrollments={enrollmentsResource.data} sections={sectionsResource.data} batchDocs={batchResource.data} />;
}

// Raw codes exist only in `result` after a press. Leaving the page loses
// them; staff add the learners again and reissue (which revokes those codes).
function SlipBatch({ me, schoolYear, onIssuingChange, students, enrollments, sections, batchDocs }) {
  const action = useAsyncAction();
  const enrolled = useMemo(() => enrolledEntries({ students, enrollments, sections, schoolYear }),
    [students, enrollments, sections, schoolYear]);
  const [lastSkipped, setLastSkipped] = useState(() => new Map());
  const { canIssue, cantIssue } = useMemo(() => splitSlipBatch({ batchDocs, enrolled, students, lastSkipped }),
    [batchDocs, enrolled, students, lastSkipped]);
  const groups = useMemo(() => groupBySection(canIssue), [canIssue]);
  const batchIds = useMemo(() => new Set(batchDocs.map((d) => d.id)), [batchDocs]);

  const [query, setQuery] = useState('');
  const [choice, setChoice] = useState(SLIP_BATCH_REASONS[0]);
  const [note, setNote] = useState('');
  const reason = batchReason(choice, note);
  const searchIndex = useMemo(() => buildLearnerIndex(enrolled, (e) => e.student), [enrolled]);
  const searchQuery = useDeferredValue(query);
  const results = useMemo(() => (searchQuery.trim()
    ? searchLearners(searchIndex, searchQuery, { includeLrn: true, limit: SEARCH_LIMIT, accept: (e) => !batchIds.has(e.student.id) })
    : []), [searchIndex, batchIds, searchQuery]);

  const [paper, setPaper] = useSlipPaper();
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const printRoot = useRef(null);
  const printReady = usePrintReadiness(printRoot, result, result?.slips?.length || 0);

  const add = (id) => { setQuery(''); action.run('add', () => addToSlipBatch(id, reason, me)); };
  const remove = (id) => action.run('remove', () => removeFromSlipBatch(id));
  // Errors are caught here (not by action.run) so the server's own message,
  // e.g. the daily limit and when it resets, reaches staff.
  const issue = async () => {
    const n = Math.min(canIssue.length, MAX_BATCH_ISSUE);
    if (!window.confirm(`Issue new slips for ${plural(n, 'learner', 'learners')}? Their current slips stop working. Guardians already linked keep access.`)) return;
    setErr(''); onIssuingChange?.(true);
    try {
      const r = await call.issueSlipBatch({ schoolYear });
      setResult(r);
      setLastSkipped(new Map(r.skipped.map((s) => [s.studentId, s.reason])));
    } catch (e) { setErr(e.message || 'Could not issue the slips.'); }
    finally { onIssuingChange?.(false); }
  };

  return (
    <>
      <div className="slips-print-hide" style={{ fontFamily: T.body, color: T.ink }}>
        <ActionFeedback action={action} />
        <Card style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'var(--sims-form-columns, 1fr auto)', gap: 12, alignItems: 'end' }}>
            <Field label="Add a learner">
              <Inp type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or LRN" />
            </Field>
            <Field label="Reason">
              <Sel value={choice} onChange={(e) => setChoice(e.target.value)}>
                {SLIP_BATCH_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </Sel>
            </Field>
          </div>
          {choice === OTHER_REASON && (
            <Field label="Reason note"><Inp value={note} maxLength={190} onChange={(e) => setNote(e.target.value)} /></Field>
          )}
          {results.length > 0 && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {results.map(({ student, section }) => (
                <li key={student.id} style={row}>
                  <span style={{ flex: 1 }}>
                    <strong>{fullName(student)}</strong>{' '}
                    <span style={{ ...T.num, color: T.inkMuted }}>{student.lrn}</span>{' '}
                    <span style={{ color: T.inkMuted }}>· {sectionLabel(section)}</span>
                  </span>
                  <Btn variant="ghost" disabled={action.busy || !reason} onClick={() => add(student.id)} aria-label={`Add ${fullName(student)}`}>Add</Btn>
                </li>
              ))}
            </ul>
          )}
          {searchQuery.trim() && results.length === 0 && (
            <p style={{ margin: 0, color: T.inkMuted, fontSize: 13 }}>No other enrolled learner matches “{searchQuery.trim()}”.</p>
          )}
        </Card>

        {(batchDocs.length > 0 || result) && (
          <Card style={{ position: 'sticky', top: 0, zIndex: 1, padding: '12px 20px', marginBottom: 12 }}>
            {batchDocs.length > 0 && <span style={{ fontWeight: 600 }}>{slipSheetFillLabel(canIssue.length, paper) || 'Nothing in the batch can be issued yet'}</span>}
            <SlipPrintControls paper={paper} onPaperChange={setPaper} printReady={printReady}>
              {batchDocs.length > 0 && <>
                <Btn variant="ghost" disabled={action.busy} onClick={() => setConfirmClear(true)}>Clear batch</Btn>
                <Btn disabled={action.busy || canIssue.length === 0} onClick={() => action.run('issue', issue)}>{issueButtonLabel(canIssue.length)}</Btn>
              </>}
            </SlipPrintControls>
            {err && <p role="alert" className="sims-feedback" style={{ margin: 0 }}>{err}</p>}
            {result && <p role="status" style={{ margin: 0, fontSize: 13 }}>{issuedSummary(result)}</p>}
          </Card>
        )}

        {batchDocs.length === 0 && !result && (
          <Card style={{ padding: 20 }}>
            <EmptyState title="The slip batch is empty" hint="Search above to add learners who need a new or first activation slip." />
          </Card>
        )}

        {groups.map(({ section, entries }) => (
          <Card key={section.id} style={{ padding: 16, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{sectionLabel(section)} · {entries.length}</div>
            <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
              {entries.map(({ student, reason: why }) => (
                <li key={student.id} style={row}>
                  <span style={{ flex: 1 }}>{fullName(student)}{' '}
                    <span style={{ ...T.num, color: T.inkMuted, fontSize: 12 }}>{student.lrn}</span></span>
                  {why && <span style={reasonTag}>{why}</span>}
                  <Btn variant="ghost" disabled={action.busy} onClick={() => remove(student.id)} aria-label={`Remove ${fullName(student)}`}>Remove</Btn>
                </li>
              ))}
            </ul>
          </Card>
        ))}

        {cantIssue.length > 0 && (
          <Card style={{ padding: 16, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Can't issue · {cantIssue.length}</div>
            <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
              {cantIssue.map(({ id, student, why }) => {
                const name = student ? fullName(student) : 'Learner record not found';
                return (
                  <li key={id} style={row}>
                    <span style={{ flex: 1, color: T.inkMuted }}>{name}{' '}
                      <span style={{ ...T.num, fontSize: 12 }}>{student?.lrn || id}</span> · {why}</span>
                    <Btn variant="ghost" disabled={action.busy} onClick={() => remove(id)} aria-label={`Remove ${name}`}>Remove</Btn>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>

      {result?.slips?.length > 0 && <div ref={printRoot}><ActivationSlipsPrintable slips={result.slips} portalUrl={PORTAL_URL} paper={paper} /></div>}
      {confirmClear && (
        <Confirm
          title="Clear the slip batch?"
          label="Clear batch"
          message={`Remove all ${plural(batchDocs.length, 'learner', 'learners')} from the slip batch? No slips are issued or revoked.`}
          onYes={async () => { await clearSlipBatch(batchDocs.map((d) => d.id)); setConfirmClear(false); }}
          onNo={() => setConfirmClear(false)}
        />
      )}
    </>
  );
}
