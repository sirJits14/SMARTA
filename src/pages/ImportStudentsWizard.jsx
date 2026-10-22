import { useEffect, useRef, useState } from 'react';
import ExcelJS from 'exceljs';
import { buildImportTemplateWorkbook, parseWorksheetRows, classifyImportRows } from '../lib/studentImport.js';
import { commitImportPlan } from '../data/studentImport.js';
import { downloadWorkbook } from '../lib/downloadWorkbook.js';
import { T, S } from '../styles.js';
import { Btn, Modal, EmptyState } from '../components/ui.jsx';
import { capsName } from '../lib/roster.js';
import { countByKind, filterResults, stepIndex } from '../lib/importPreview.js';

const KIND_LABEL = { new: 'New', update: 'Update', error: 'Error' };
const KIND_COLOR = { new: T.present, update: T.primary, error: T.absent };
const FILTERS = [['all', 'All'], ['new', 'New'], ['update', 'Updates'], ['error', 'Errors']];
const tint = (token, pct) => `color-mix(in srgb, ${token} ${pct}%, transparent)`;
const ERROR_TINT = tint(T.absent, 8);
const ERROR_TINT_CURRENT = tint(T.absent, 20);
const linkBtn = { fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 600, color: T.absent, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' };
const chipBtn = (active, kind, disabled) => ({
  fontFamily: T.body, fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999,
  border: `1px solid ${active ? (kind === 'error' ? T.absent : T.primary) : T.border}`,
  background: active ? tint(kind === 'error' ? T.absent : T.primary, 15) : 'transparent',
  color: kind === 'error' ? T.absent : T.ink, opacity: disabled ? 0.4 : 1, cursor: disabled ? 'default' : 'pointer',
});

export default function ImportStudentsWizard({ students, sections, schoolYear, onClose }) {
  const [step, setStep] = useState('upload');
  const [headerError, setHeaderError] = useState('');
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [commitError, setCommitError] = useState('');
  const fileInputRef = useRef(null);
  const importLock = useRef(false);
  const tableRef = useRef(null);
  const [filter, setFilter] = useState('all');
  const [errIdx, setErrIdx] = useState(-1);

  const downloadTemplate = () => downloadWorkbook(buildImportTemplateWorkbook(), 'bnhs-sims-student-import-template.xlsx');

  const onFileChosen = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setHeaderError('');
    const buf = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    const { headerError: hErr, rows } = parseWorksheetRows(ws);
    if (hErr) {
      setHeaderError(hErr);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setPlan(classifyImportRows({ rows, students, sections, schoolYear }));
    setStep('preview');
  };

  const runImport = async () => {
    if (importLock.current) return;
    importLock.current = true;
    setBusy(true);
    setCommitError('');
    try {
      const res = await commitImportPlan({ plan, sections, schoolYear });
      setResult(res);
      setStep('result');
    } catch (err) {
      setCommitError('Something went wrong while importing. Some rows may have already been written — check the Students table, then try importing again; already-imported rows will be safely re-matched by LRN.');
    } finally {
      importLock.current = false; setBusy(false);
    }
  };

  const importCount = plan ? plan.summary.newCount + plan.summary.updateCount : 0;

  const counts = plan ? countByKind(plan.results) : null;
  const visible = plan ? filterResults(plan.results, filter) : [];
  const errorRows = plan ? plan.results.filter((r) => r.kind === 'error') : [];
  const currentErrorRow = errIdx >= 0 ? errorRows[errIdx]?.rowNumber : null;

  const chooseFilter = (f) => { setFilter(f); setErrIdx(-1); };
  const showErrors = () => { setFilter('error'); setErrIdx(0); };
  const stepError = (dir) => setErrIdx((i) => stepIndex(i, errorRows.length, dir));

  useEffect(() => {
    if (currentErrorRow == null) return;
    const el = tableRef.current?.querySelector(`[data-row="${currentErrorRow}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    el.focus({ preventScroll: true });
  }, [currentErrorRow, filter]);

  return (
    <Modal labelledBy="import-title" onClose={onClose} dismissible={!busy} width={720}>
      <h2 id="import-title" style={{ fontFamily: T.display, color: T.ink, marginTop: 0, fontSize: 17, fontWeight: 600 }}>Import learners from Excel</h2>

      {step === 'upload' && (
        <>
          <p style={{ fontFamily: T.body, fontSize: 'var(--sims-field-font, 13px)', color: T.inkMuted }}>
            Download the template, fill in one row per learner (bio-data plus Grade and Section), then upload it here.
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <Btn variant="ghost" onClick={downloadTemplate}>Download template</Btn>
          </div>
          <input ref={fileInputRef} type="file" accept=".xlsx" onChange={onFileChosen} />
          {headerError && (
            <div style={{ fontFamily: T.body, background: 'rgba(220,38,38,0.1)', color: T.absent, borderRadius: T.radius, padding: '8px 10px', fontSize: 12, marginTop: 12 }}>
              {headerError}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          </div>
        </>
      )}

      {step === 'preview' && plan && (
        <>
          <p style={{ fontFamily: T.body, fontSize: 'var(--sims-field-font, 13px)', color: T.ink, fontWeight: 600 }}>
            {plan.summary.newCount} new · {plan.summary.updateCount} updates · {plan.summary.newSectionsCount} new section{plan.summary.newSectionsCount === 1 ? '' : 's'} to create · {plan.summary.errorCount > 0
              ? <button type="button" style={linkBtn} onClick={showErrors} aria-label={`Show ${plan.summary.errorCount} skipped error${plan.summary.errorCount === 1 ? '' : 's'}`}>{plan.summary.errorCount} error{plan.summary.errorCount === 1 ? '' : 's'} skipped</button>
              : <>{plan.summary.errorCount} errors skipped</>}
          </p>
          <div role="group" aria-label="Filter rows" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            {FILTERS.map(([key, label]) => {
              const disabled = key !== 'all' && counts[key] === 0;
              return (
                <button key={key} type="button" aria-pressed={filter === key} disabled={disabled}
                  style={chipBtn(filter === key, key === 'error' ? 'error' : '', disabled)} onClick={() => chooseFilter(key)}>
                  {label} ({counts[key]})
                </button>
              );
            })}
            {errorRows.length > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', fontFamily: T.body, fontSize: 12, color: T.inkMuted }}>
                <span aria-live="polite">{errIdx >= 0 ? `Error ${errIdx + 1} of ${errorRows.length}` : `${errorRows.length} error${errorRows.length === 1 ? '' : 's'}`}</span>
                <Btn variant="ghost" onClick={() => stepError(-1)}>Previous error</Btn>
                <Btn variant="ghost" onClick={() => stepError(1)}>Next error</Btn>
              </span>
            )}
          </div>
          <div ref={tableRef} style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto', border: `1px solid ${T.border}`, borderRadius: T.radius }}>
            <div className="sims-table-scroll" role="region" aria-label="Records" tabIndex={0}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={S.thead}>
                {['Row', 'Status', 'LRN', 'Name', 'Grade', 'Section', 'Detail'].map((h) => <th key={h} style={S.th}>{h}</th>)}
              </tr></thead>
              <tbody>{visible.length === 0 && <tr><td colSpan={7} style={{ ...S.td, color: T.inkMuted }}>No rows match.</td></tr>}{visible.map((r) => (
                <tr key={r.rowNumber} data-row={r.rowNumber} tabIndex={r.kind === 'error' ? -1 : undefined}
                  style={r.kind === 'error' ? { background: r.rowNumber === currentErrorRow ? ERROR_TINT_CURRENT : ERROR_TINT, outline: 'none' } : undefined}>
                  <td style={S.td}>{r.rowNumber}</td>
                  <td style={{ ...S.td, color: KIND_COLOR[r.kind], fontWeight: 600 }}>{KIND_LABEL[r.kind]}</td>
                  <td style={{ ...S.td, ...T.num }}>{r.student?.lrn || '—'}</td>
                  <td style={S.td}>{r.student ? capsName(`${r.student.lastName}, ${r.student.firstName}`) : '—'}</td>
                  <td style={S.td}>{r.gradeLevel ?? '—'}</td>
                  <td style={S.td}>{r.sectionName ?? '—'}</td>
                  <td style={{ ...S.td, color: r.kind === 'error' ? T.absent : T.inkMuted }}>{r.errors ? Object.values(r.errors).join(' ') : ''}</td>
                </tr>
              ))}</tbody>
            </table></div>
          </div>
          {commitError && (
            <div style={{ fontFamily: T.body, background: 'rgba(220,38,38,0.1)', color: T.absent, borderRadius: T.radius, padding: '8px 10px', fontSize: 12, marginTop: 12 }}>
              {commitError}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Btn variant="ghost" onClick={onClose} disabled={busy}>Cancel</Btn>
            <Btn onClick={runImport} disabled={busy || importCount === 0}>
              {busy ? 'Importing…' : `Import ${importCount} learner${importCount === 1 ? '' : 's'}`}
            </Btn>
          </div>
        </>
      )}

      {step === 'result' && result && plan && (
        <>
          <EmptyState
            title="Import complete"
            hint={`${result.studentsWritten} learner${result.studentsWritten === 1 ? '' : 's'} created or updated, ${result.sectionsCreated} new section${result.sectionsCreated === 1 ? '' : 's'} created, ${plan.summary.errorCount} error${plan.summary.errorCount === 1 ? '' : 's'} skipped.`}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Btn onClick={onClose}>Done</Btn>
          </div>
        </>
      )}
    </Modal>
  );
}
