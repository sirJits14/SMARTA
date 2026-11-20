import { useMemo, useRef, useState } from 'react';
import { usePrintReadiness } from '../../hooks/usePrintReadiness.js';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { ActionFeedback, Badge, Btn, Card, EmptyState, Confirm } from '../../components/ui.jsx';
import IdCardsPrintSheets from '../../components/IdCardsPrintable.jsx';
import { useIdCardPrintConfirm } from '../../components/IdCardPrintConfirm.jsx';
import { addApprovedToBatch, dismissApproved } from '../../data/idCards.js';
import { enrolledEntries, buildApprovedView, groupBySection, isIdCardPrinted, sheetFillLabel, approvalText } from '../../lib/idCardQueue.js';
import { fullName } from '../../lib/roster.js';
import { T } from '../../styles.js';

const sectionLabel = (s) => `Grade ${s.gradeLevel} - ${s.name}${s.strand ? ` · ${s.strand}` : ''}`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const row = { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13, flexWrap: 'wrap' };

// New learners whose add request was approved, waiting for their first card (plan 2026-10-30).
// Pick some or all, then print them now or move them to the saved batch.
export default function RecentlyApprovedTab({ me, students, enrollments, sections, schoolYear, approvedDocs }) {
  const enrolled = useMemo(() => enrolledEntries({ students, enrollments, sections, schoolYear }),
    [students, enrollments, sections, schoolYear]);
  const { printable, notPrintable } = useMemo(() => buildApprovedView({ approvedDocs, enrolled, students }),
    [approvedDocs, enrolled, students]);
  const groups = useMemo(() => groupBySection(printable), [printable]);

  const [selected, setSelected] = useState(() => new Set());
  // Derived from the live list, so a learner printed or dismissed elsewhere drops out of the selection.
  const chosen = useMemo(() => printable.filter((e) => selected.has(e.student.id)), [printable, selected]);
  const chosenIds = chosen.map((e) => e.student.id);
  const allChosen = printable.length > 0 && chosen.length === printable.length;
  const clearSelection = () => setSelected(new Set());
  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setSelected(allChosen ? new Set() : new Set(printable.map((e) => e.student.id)));

  const [confirmDismiss, setConfirmDismiss] = useState(false);
  const action = useAsyncAction();
  const { printAndConfirm, confirmDialog } = useIdCardPrintConfirm(me, { onMarked: clearSelection });
  const printRoot = useRef(null);
  const printKey = chosen.map((e) => e.student.id + e.student.lrn + e.section.id).join(',');
  const printReady = usePrintReadiness(printRoot, printKey, chosen.length);

  const toBatch = () => action.run('batch', async () => { await addApprovedToBatch(chosenIds, me); clearSelection(); });
  const dismissOne = (id) => action.run('dismiss', () => dismissApproved([id]));

  if (approvedDocs.length === 0) {
    return (
      <Card style={{ padding: 20 }}>
        <EmptyState title="No new learners waiting" hint="New learners appear here when their add request is approved in Learner requests." />
      </Card>
    );
  }

  return (
    <>
      <div className="id-cards-controls" style={{ fontFamily: T.body, color: T.ink }}>
        <ActionFeedback action={action} />
        {printable.length > 0 && (
          <Card style={{ position: 'sticky', top: 0, zIndex: 1, padding: '12px 20px', marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <label className="sims-check">
              <input type="checkbox" checked={allChosen} onChange={toggleAll} /> Select all ({printable.length})
            </label>
            <span style={{ fontWeight: 600 }}>
              {chosen.length > 0 ? `${chosen.length} selected · ${sheetFillLabel(chosen.length)}` : 'Select learners to print or add to the saved batch'}
            </span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn variant="ghost" disabled={action.busy || chosen.length === 0} onClick={() => setConfirmDismiss(true)}>Dismiss</Btn>
              <Btn variant="ghost" disabled={action.busy || chosen.length === 0} onClick={toBatch}>Add to saved batch</Btn>
              <Btn disabled={action.busy || chosen.length === 0 || !printReady} onClick={() => printAndConfirm(chosen.map((e) => e.student))}>
                {chosen.length === 0 || printReady ? 'Print selected' : 'Preparing QR codes…'}
              </Btn>
            </div>
          </Card>
        )}

        {groups.map(({ section, entries }) => (
          <Card key={section.id} style={{ padding: 16, marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{sectionLabel(section)} · {entries.length}</div>
            <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
              {entries.map(({ student, approval }) => (
                <li key={student.id} style={row}>
                  <input type="checkbox" checked={selected.has(student.id)} onChange={() => toggle(student.id)} aria-label={`Select ${fullName(student)}`} />
                  <span style={{ flex: 1 }}>{fullName(student)}{' '}
                    <span style={{ ...T.num, color: T.inkMuted, fontSize: 12 }}>{student.lrn}</span>
                    <span style={{ display: 'block', color: T.inkMuted, fontSize: 12 }}>{approvalText(approval)}</span></span>
                  {isIdCardPrinted(student) && <Badge tone="accent">Printed</Badge>}
                </li>
              ))}
            </ul>
          </Card>
        ))}

        {notPrintable.length > 0 && (
          <Card style={{ padding: 16, marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Not enrolled — won't print · {notPrintable.length}</div>
            <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
              {notPrintable.map(({ id, student, approval }) => {
                const name = student ? fullName(student) : 'Learner record not found';
                return (
                  <li key={id} style={row}>
                    <span style={{ flex: 1, color: T.inkMuted }}>{name}{' '}
                      <span style={{ ...T.num, fontSize: 12 }}>{student?.lrn || id}</span>
                      <span style={{ display: 'block', fontSize: 12 }}>{approvalText(approval)}</span></span>
                    <Btn variant="ghost" disabled={action.busy} onClick={() => dismissOne(id)} aria-label={`Dismiss ${name}`}>Dismiss</Btn>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>

      {chosen.length > 0 && <div ref={printRoot}><IdCardsPrintSheets entries={chosen} printOnly /></div>}
      {confirmDialog}
      {confirmDismiss && (
        <Confirm
          title="Dismiss these learners?"
          label="Dismiss"
          message={`Remove ${plural(chosenIds.length, 'learner', 'learners')} from Recently approved? Their cards are not printed and they are not added to the saved batch.`}
          onYes={async () => { await dismissApproved(chosenIds); clearSelection(); setConfirmDismiss(false); }}
          onNo={() => setConfirmDismiss(false)}
        />
      )}
    </>
  );
}
