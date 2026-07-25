import { useRef, useState } from 'react';
import ExcelJS from 'exceljs';
import { buildImportTemplateWorkbook, parseWorksheetRows, classifyImportRows } from '../lib/studentImport.js';
import { commitImportPlan } from '../data/studentImport.js';
import { downloadWorkbook } from '../lib/downloadWorkbook.js';
import { T, S } from '../styles.js';
import { Btn, Modal, EmptyState } from '../components/ui.jsx';

const KIND_LABEL = { new: 'New', update: 'Update', error: 'Error' };
const KIND_COLOR = { new: T.present, update: T.primary, error: T.absent };

export default function ImportStudentsWizard({ students, sections, schoolYear, onClose }) {
  const [step, setStep] = useState('upload');
  const [headerError, setHeaderError] = useState('');
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

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
    setBusy(true);
    const res = await commitImportPlan({ plan, sections, schoolYear });
    setResult(res);
    setBusy(false);
    setStep('result');
  };

  const importCount = plan ? plan.summary.newCount + plan.summary.updateCount : 0;

  return (
    <Modal onClose={onClose} width={720}>
      <h2 style={{ fontFamily: T.display, color: T.ink, marginTop: 0, fontSize: 17, fontWeight: 600 }}>Import learners from Excel</h2>

      {step === 'upload' && (
        <>
          <p style={{ fontFamily: T.body, fontSize: 13, color: T.inkMuted }}>
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
          <p style={{ fontFamily: T.body, fontSize: 13, color: T.ink, fontWeight: 600 }}>
            {plan.summary.newCount} new · {plan.summary.updateCount} updates · {plan.summary.newSectionsCount} new section{plan.summary.newSectionsCount === 1 ? '' : 's'} to create · {plan.summary.errorCount} error{plan.summary.errorCount === 1 ? '' : 's'} skipped
          </p>
          <div style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto', border: `1px solid ${T.border}`, borderRadius: T.radius }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={S.thead}>
                {['Row', 'Status', 'LRN', 'Name', 'Grade', 'Section', 'Detail'].map((h) => <th key={h} style={S.th}>{h}</th>)}
              </tr></thead>
              <tbody>{plan.results.map((r) => (
                <tr key={r.rowNumber}>
                  <td style={S.td}>{r.rowNumber}</td>
                  <td style={{ ...S.td, color: KIND_COLOR[r.kind], fontWeight: 700 }}>{KIND_LABEL[r.kind]}</td>
                  <td style={{ ...S.td, ...T.num }}>{r.student?.lrn || '—'}</td>
                  <td style={S.td}>{r.student ? `${r.student.lastName}, ${r.student.firstName}` : '—'}</td>
                  <td style={S.td}>{r.gradeLevel ?? '—'}</td>
                  <td style={S.td}>{r.sectionName ?? '—'}</td>
                  <td style={{ ...S.td, color: T.inkMuted }}>{r.errors ? Object.values(r.errors).join(' ') : ''}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
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
