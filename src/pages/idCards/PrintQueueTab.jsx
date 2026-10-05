import { useMemo, useRef, useState } from 'react';
import { usePrintReadiness } from '../../hooks/usePrintReadiness.js';
import { Btn, Inp, Field, Card, EmptyState, Confirm } from '../../components/ui.jsx';
import IdCardsPrintSheets from '../../components/IdCardsPrintable.jsx';
import { useIdCardPrintConfirm } from '../../components/IdCardPrintConfirm.jsx';
import { markIdCardsPrinted } from '../../data/idCards.js';
import { buildIdCardQueue, listQueueEntries, groupBySection, isIdCardPrinted, cardsLabel } from '../../lib/idCardQueue.js';
import { ID_CARD_PRINT_LAYOUT } from '../idCardPrintLayout.js';
import { learnerMatches } from '../../lib/search.js';
import { fullName } from '../../lib/roster.js';
import { T } from '../../styles.js';

const sectionLabel = (s) => `Grade ${s.gradeLevel} - ${s.name}${s.strand ? ` · ${s.strand}` : ''}`;
const SEARCH_LIMIT = 8;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const reprintTag = { fontSize: 11, fontWeight: 600, color: T.primary, border: `1px solid ${T.primary}`, borderRadius: T.pill, padding: '1px 8px' };

export default function PrintQueueTab({ me, students, enrollments, sections, schoolYear }) {
  const { eligible, queue, missingLrnCount } = useMemo(
    () => buildIdCardQueue({ students, enrollments, sections, schoolYear }),
    [students, enrollments, sections, schoolYear]);
  const [addedIds, setAddedIds] = useState(() => new Set());
  const [excludedIds, setExcludedIds] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const [confirmMark, setConfirmMark] = useState(false);

  const listed = useMemo(() => listQueueEntries(eligible, addedIds), [eligible, addedIds]);
  const listedIds = useMemo(() => new Set(listed.map((e) => e.student.id)), [listed]);
  const groups = useMemo(() => groupBySection(listed), [listed]);
  const batch = useMemo(() => listed.filter((e) => !excludedIds.has(e.student.id)), [listed, excludedIds]);
  const batchStudents = useMemo(() => batch.map((e) => e.student), [batch]);
  const results = useMemo(() => (query.trim()
    ? eligible.filter((e) => !listedIds.has(e.student.id) && learnerMatches(query, e.student, { includeLrn: true })).slice(0, SEARCH_LIMIT)
    : []), [eligible, listedIds, query]);

  const reset = () => { setAddedIds(new Set()); setExcludedIds(new Set()); };
  const { printAndConfirm, confirmDialog } = useIdCardPrintConfirm(me, { onMarked: reset });

  const setTicked = (ids, ticked) => setExcludedIds((prev) => {
    const next = new Set(prev);
    ids.forEach((id) => (ticked ? next.delete(id) : next.add(id)));
    return next;
  });
  const add = (id) => { setAddedIds((prev) => new Set(prev).add(id)); setTicked([id], true); setQuery(''); };
  const remove = (id) => { setAddedIds((prev) => { const next = new Set(prev); next.delete(id); return next; }); setTicked([id], true); };

  const printRoot = useRef(null);
  const printKey = batch.map((e) => e.student.id + e.student.lrn + e.section.id).join(',');
  const printReady = usePrintReadiness(printRoot, printKey, batch.length);
  const sheets = Math.ceil(batch.length / ID_CARD_PRINT_LAYOUT.cardsPerSheet);

  return (
    <>
      <div className="id-cards-controls">
        <Card style={{ padding: 20, marginBottom: 16 }}>
          <p style={{ margin: '0 0 12px', fontFamily: T.body, color: T.ink, fontSize: 14 }}>
            <strong>{queue.length}</strong> {queue.length === 1 ? 'learner' : 'learners'} not yet printed
          </p>
          {missingLrnCount > 0 && (
            <p style={{ margin: '0 0 12px', fontFamily: T.body, color: T.inkMuted, fontSize: 13 }}>
              {plural(missingLrnCount, 'learner has', 'learners have')} no LRN and can't be printed.
            </p>
          )}
          <Field label="Add a learner (reprint or extra card)">
            <Inp value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or LRN" />
          </Field>
          {results.length > 0 && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {results.map(({ student, section }) => (
                <li key={student.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontFamily: T.body, fontSize: 13 }}>
                  <span style={{ flex: 1 }}>
                    <strong>{fullName(student)}</strong>{' '}
                    <span style={{ ...T.num, color: T.inkMuted }}>{student.lrn}</span>{' '}
                    <span style={{ color: T.inkMuted }}>· {sectionLabel(section)}</span>
                  </span>
                  <Btn variant="ghost" onClick={() => add(student.id)} aria-label={`Add ${fullName(student)}`}>Add</Btn>
                </li>
              ))}
            </ul>
          )}
          {query.trim() && results.length === 0 && (
            <p style={{ margin: 0, fontFamily: T.body, color: T.inkMuted, fontSize: 13 }}>No other enrolled learner matches "{query.trim()}".</p>
          )}
        </Card>

        {listed.length === 0 ? (
          <Card style={{ padding: 20 }}>
            <EmptyState title="Every enrolled learner has a printed card" hint="Search above to add a learner who needs a reprint." />
          </Card>
        ) : groups.map(({ section, entries }) => {
          const ids = entries.map((e) => e.student.id);
          const ticked = ids.filter((id) => !excludedIds.has(id)).length;
          return (
            <Card key={section.id} style={{ padding: 16, marginBottom: 12, fontFamily: T.body, color: T.ink }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, fontSize: 14 }}>
                <input type="checkbox" checked={ticked === ids.length}
                  ref={(node) => { if (node) node.indeterminate = ticked > 0 && ticked < ids.length; }}
                  onChange={(e) => setTicked(ids, e.target.checked)} />
                {sectionLabel(section)} · {ticked} of {ids.length}
              </label>
              <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
                {entries.map(({ student }) => (
                  <li key={student.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 4px 24px', fontSize: 13 }}>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, flexWrap: 'wrap' }}>
                      <input type="checkbox" checked={!excludedIds.has(student.id)} onChange={(e) => setTicked([student.id], e.target.checked)} />
                      <span>{fullName(student)}</span>
                      <span style={{ ...T.num, color: T.inkMuted, fontSize: 12 }}>{student.lrn}</span>
                      {isIdCardPrinted(student) && <span style={reprintTag}>Reprint</span>}
                    </label>
                    {addedIds.has(student.id) && (
                      <Btn variant="ghost" onClick={() => remove(student.id)} aria-label={`Remove ${fullName(student)}`}>Remove</Btn>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}

        {listed.length > 0 && (
          <Card style={{ position: 'sticky', bottom: 0, padding: '12px 20px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', fontFamily: T.body }}>
            <span style={{ fontWeight: 600, color: T.ink }}>{cardsLabel(batch.length)} · {plural(sheets, 'sheet', 'sheets')}</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn variant="ghost" disabled={batch.length === 0} onClick={() => setConfirmMark(true)}>Mark as printed without printing</Btn>
              <Btn disabled={batch.length === 0 || !printReady} onClick={() => printAndConfirm(batchStudents)}>
                {batch.length === 0 || printReady ? 'Print' : 'Preparing QR codes…'}
              </Btn>
            </div>
          </Card>
        )}
      </div>

      {batch.length > 0 && <div ref={printRoot}><IdCardsPrintSheets entries={batch} printOnly /></div>}
      {confirmDialog}
      {confirmMark && (
        <Confirm
          title="Mark without printing?"
          danger={false}
          label="Mark as printed"
          message={`Mark ${plural(batch.length, 'learner', 'learners')} as printed? They will leave the queue.`}
          onYes={async () => { await markIdCardsPrinted(batchStudents, me); setConfirmMark(false); reset(); }}
          onNo={() => setConfirmMark(false)}
        />
      )}
    </>
  );
}
