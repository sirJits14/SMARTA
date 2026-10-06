import { useMemo, useRef, useState } from 'react';
import { usePrintReadiness } from '../../hooks/usePrintReadiness.js';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { ActionFeedback, Btn, Inp, Field, Card, EmptyState, Confirm } from '../../components/ui.jsx';
import IdCardsPrintSheets from '../../components/IdCardsPrintable.jsx';
import { useIdCardPrintConfirm } from '../../components/IdCardPrintConfirm.jsx';
import { addToIdCardBatch, removeFromIdCardBatch, clearIdCardBatch, markBatchPrinted } from '../../data/idCards.js';
import { enrolledEntries, buildBatchView, groupBySection, isIdCardPrinted, sheetFillLabel } from '../../lib/idCardQueue.js';
import { learnerMatches } from '../../lib/search.js';
import { fullName } from '../../lib/roster.js';
import { T } from '../../styles.js';

const sectionLabel = (s) => `Grade ${s.gradeLevel} - ${s.name}${s.strand ? ` · ${s.strand}` : ''}`;
const SEARCH_LIMIT = 8;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const printedTag = { fontSize: 11, fontWeight: 600, color: T.primary, border: `1px solid ${T.primary}`, borderRadius: T.pill, padding: '1px 8px' };
const row = { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13, flexWrap: 'wrap' };

export default function SavedBatchTab({ me, students, enrollments, sections, schoolYear, batchDocs }) {
  const enrolled = useMemo(() => enrolledEntries({ students, enrollments, sections, schoolYear }),
    [students, enrollments, sections, schoolYear]);
  const { printable, notPrintable } = useMemo(() => buildBatchView({ batchDocs, enrolled, students }),
    [batchDocs, enrolled, students]);
  const batchIds = useMemo(() => new Set(batchDocs.map((d) => d.id)), [batchDocs]);
  const groups = useMemo(() => groupBySection(printable), [printable]);
  const printableStudents = useMemo(() => printable.map((e) => e.student), [printable]);

  const [query, setQuery] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const action = useAsyncAction();
  const results = useMemo(() => (query.trim()
    ? enrolled.filter((e) => !batchIds.has(e.student.id) && learnerMatches(query, e.student, { includeLrn: true })).slice(0, SEARCH_LIMIT)
    : []), [enrolled, batchIds, query]);

  const { printAndConfirm, confirmDialog } = useIdCardPrintConfirm(me, { mark: markBatchPrinted });
  const printRoot = useRef(null);
  const printKey = printable.map((e) => e.student.id + e.student.lrn + e.section.id).join(',');
  const printReady = usePrintReadiness(printRoot, printKey, printable.length);
  const fill = sheetFillLabel(printable.length);

  const add = (id) => { setQuery(''); action.run('add', () => addToIdCardBatch(id, me)); };
  const remove = (id) => action.run('remove', () => removeFromIdCardBatch(id));

  return (
    <>
      <div className="id-cards-controls" style={{ fontFamily: T.body, color: T.ink }}>
        <Card style={{ padding: 20, marginBottom: 16 }}>
          <ActionFeedback action={action} />
          <Field label="Add a learner">
            <Inp value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or LRN" />
          </Field>
          {results.length > 0 && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {results.map(({ student, section }) => (
                <li key={student.id} style={row}>
                  <span style={{ flex: 1 }}>
                    <strong>{fullName(student)}</strong>{' '}
                    <span style={{ ...T.num, color: T.inkMuted }}>{student.lrn}</span>{' '}
                    <span style={{ color: T.inkMuted }}>· {sectionLabel(section)}</span>
                  </span>
                  {isIdCardPrinted(student) && <span style={printedTag}>Printed</span>}
                  <Btn variant="ghost" disabled={action.busy} onClick={() => add(student.id)} aria-label={`Add ${fullName(student)}`}>Add</Btn>
                </li>
              ))}
            </ul>
          )}
          {query.trim() && results.length === 0 && (
            <p style={{ margin: 0, color: T.inkMuted, fontSize: 13 }}>No other enrolled learner matches “{query.trim()}”.</p>
          )}
        </Card>

        {batchDocs.length === 0 ? (
          <Card style={{ padding: 20 }}>
            <EmptyState title="The batch is empty" hint="Search above to add learners whose cards still need printing." />
          </Card>
        ) : (
          <>
            <Card style={{ position: 'sticky', top: 0, zIndex: 1, padding: '12px 20px', marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600 }}>{fill || 'Nothing in the batch can print yet'}</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Btn variant="ghost" onClick={() => setConfirmClear(true)}>Clear batch</Btn>
                <Btn disabled={printable.length === 0 || !printReady} onClick={() => printAndConfirm(printableStudents)}>
                  {printable.length === 0 || printReady ? 'Print' : 'Preparing QR codes…'}
                </Btn>
              </div>
            </Card>

            {groups.map(({ section, entries }) => (
              <Card key={section.id} style={{ padding: 16, marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{sectionLabel(section)} · {entries.length}</div>
                <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
                  {entries.map(({ student }) => (
                    <li key={student.id} style={row}>
                      <span style={{ flex: 1 }}>{fullName(student)}{' '}
                        <span style={{ ...T.num, color: T.inkMuted, fontSize: 12 }}>{student.lrn}</span></span>
                      {isIdCardPrinted(student) && <span style={printedTag}>Printed</span>}
                      <Btn variant="ghost" disabled={action.busy} onClick={() => remove(student.id)} aria-label={`Remove ${fullName(student)}`}>Remove</Btn>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}

            {notPrintable.length > 0 && (
              <Card style={{ padding: 16, marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Not enrolled — won't print · {notPrintable.length}</div>
                <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
                  {notPrintable.map(({ id, student }) => {
                    const name = student ? fullName(student) : 'Learner record not found';
                    return (
                      <li key={id} style={row}>
                        <span style={{ flex: 1, color: T.inkMuted }}>{name}{' '}
                          <span style={{ ...T.num, fontSize: 12 }}>{student?.lrn || id}</span></span>
                        <Btn variant="ghost" disabled={action.busy} onClick={() => remove(id)} aria-label={`Remove ${name}`}>Remove</Btn>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
          </>
        )}
      </div>

      {printable.length > 0 && <div ref={printRoot}><IdCardsPrintSheets entries={printable} printOnly /></div>}
      {confirmDialog}
      {confirmClear && (
        <Confirm
          title="Clear the batch?"
          label="Clear batch"
          message={`Remove all ${plural(batchDocs.length, 'learner', 'learners')} from the batch? Nothing is marked printed.`}
          onYes={async () => { await clearIdCardBatch(batchDocs.map((d) => d.id)); setConfirmClear(false); }}
          onNo={() => setConfirmClear(false)}
        />
      )}
    </>
  );
}
