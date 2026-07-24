import { useMemo, useState } from 'react';
import { useCollection } from '../hooks/useCollection.js';
import { fullName, depedSort } from '../lib/roster.js';
import { schoolDaysInMonth, monthLabel, localMonth } from '../lib/dates.js';
import { markFor, summarizeMonth } from '../lib/attendance.js';
import { buildSF2Workbook } from '../lib/sf2.js';
import { T, S, MARK_COLOR } from '../styles.js';
import { Sel, Inp, Field, Btn, Card, EmptyState } from '../components/ui.jsx';

const sectionLabel = (s) => s ? `${s.name} · Grade ${s.gradeLevel}${s.strand ? ` · ${s.strand}` : ''}` : '—';

async function download(wb, filename) {
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

export default function AttendanceSummaryPage({ schoolYear }) {
  const sections = useCollection('sections');
  const enrollments = useCollection('enrollments');
  const students = useCollection('students');
  const attendance = useCollection('student_attendance');

  const sectionsSY = useMemo(() =>
    sections
      .filter((s) => s.schoolYear === schoolYear)
      .sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name)),
    [sections, schoolYear]);

  const [sectionId, setSectionId] = useState('');
  const [ym, setYm] = useState(localMonth());
  const section = sectionsSY.find((s) => s.id === sectionId) || null;

  const [year, month] = ym.split('-').map(Number);
  const schoolDays = useMemo(() => schoolDaysInMonth(year, month), [year, month]);
  const monthLabelText = monthLabel(ym);

  const roster = useMemo(() => {
    if (!sectionId) return [];
    const ids = new Set(enrollments.filter((e) => e.sectionId === sectionId && e.status === 'enrolled').map((e) => e.studentId));
    return depedSort(students.filter((s) => ids.has(s.id)));
  }, [enrollments, students, sectionId]);

  const docsByDate = useMemo(() => {
    if (!sectionId) return {};
    const out = {};
    for (const doc of attendance) {
      if (doc.sectionId === sectionId && doc.date?.startsWith(ym)) out[doc.date] = doc;
    }
    return out;
  }, [attendance, sectionId, ym]);

  const totals = useMemo(() =>
    summarizeMonth({ roster: roster.map((s) => s.id), schoolDays, docsByDate }),
    [roster, schoolDays, docsByDate]);

  const doExport = async () => {
    const wb = buildSF2Workbook({ section, roster, schoolDays, docsByDate, monthLabelText });
    await download(wb, `SF2_${section.name}_${ym}.xlsx`);
  };

  return (
    <div>
      <div style={S.plate}>
        <h1 style={S.h1}>Attendance summary</h1>
        <span style={{ ...T.num, fontSize: 12, color: T.manila, opacity: 0.75 }}>SY {schoolYear}</span>
      </div>

      <Card style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: 260 }}>
            <Field label="Section">
              <Sel value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                <option value="">Choose a section…</option>
                {sectionsSY.map((s) => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}
              </Sel>
            </Field>
          </div>
          <div style={{ minWidth: 180 }}>
            <Field label="Month"><Inp type="month" value={ym} onChange={(e) => setYm(e.target.value)} /></Field>
          </div>
          {sectionId && roster.length > 0 && (
            <div style={{ marginBottom: 12 }}><Btn onClick={doExport}>Export SF2 (Excel)</Btn></div>
          )}
        </div>
      </Card>

      {!sectionId ? (
        <Card style={{ padding: 20 }}><EmptyState title="Pick a section" hint="Choose a section above to see its monthly attendance summary." /></Card>
      ) : roster.length === 0 ? (
        <Card style={{ padding: 20 }}><EmptyState title="No learners enrolled here yet" hint="Enroll learners into this section on the Enrollment page first." /></Card>
      ) : (
        <Card style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
            <thead>
              <tr style={S.thead}>
                <th style={{ ...S.th, ...T.num, textTransform: 'none', position: 'sticky', left: 0, background: 'inherit' }}>#</th>
                <th style={{ ...S.th, position: 'sticky', left: 28, background: 'inherit', minWidth: 160 }}>Name</th>
                {schoolDays.map((d) => (
                  <th key={d} style={{ ...S.th, ...T.num, textAlign: 'center', textTransform: 'none', minWidth: 28, padding: '9px 6px' }}>
                    {Number(d.slice(-2))}
                  </th>
                ))}
                <th style={{ ...S.th, ...T.num, textAlign: 'center', textTransform: 'none', color: T.present }}>P</th>
                <th style={{ ...S.th, ...T.num, textAlign: 'center', textTransform: 'none', color: T.absent }}>A</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((s, idx) => {
                const t = totals[s.id];
                return (
                  <tr key={s.id}>
                    <td style={{ ...S.td, ...T.num, position: 'sticky', left: 0, background: T.manila }}>{idx + 1}</td>
                    <td style={{ ...S.td, fontWeight: 600, color: T.ink, position: 'sticky', left: 28, background: T.manila }}>{fullName(s)}</td>
                    {schoolDays.map((d) => {
                      const m = markFor(docsByDate, d, s.id);
                      return (
                        <td key={d} style={{ ...S.td, ...T.num, textAlign: 'center', padding: '8px 6px', color: MARK_COLOR[m], fontWeight: 700 }}>
                          {m === 'P' ? '' : m}
                        </td>
                      );
                    })}
                    <td style={{ ...S.td, ...T.num, textAlign: 'center', fontWeight: 700, color: T.present }}>{t.present}</td>
                    <td style={{ ...S.td, ...T.num, textAlign: 'center', fontWeight: 700, color: T.absent }}>{t.absent}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
