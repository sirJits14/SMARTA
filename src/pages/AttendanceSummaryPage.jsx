import { useMemo, useState } from 'react';
import { useCollection } from '../hooks/useCollection.js';
import { fullName, depedSort } from '../lib/roster.js';
import { schoolDaysInMonth, monthLabel, localMonth } from '../lib/dates.js';
import { markFor, summarizeMonth } from '../lib/attendance.js';
import { buildSF2Workbook } from '../lib/sf2.js';
import { T, S, MARK_COLOR } from '../styles.js';
import { Sel, Field, Btn, EmptyState } from '../components/ui.jsx';

const sectionLabel = (s) => s ? `${s.name} · Grade ${s.gradeLevel}${s.strand ? ` · ${s.strand}` : ''}` : '—';

async function download(wb, filename) {
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
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
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <h1 style={{ fontFamily:T.display, margin:0 }}>Attendance summary</h1>
        <span style={{ ...T.num, fontSize:13, color:T.excused }}>SY {schoolYear}</span>
      </div>

      <div style={{ display:'flex', gap:16, marginBottom:16, flexWrap:'wrap', alignItems:'flex-end' }}>
        <div style={{ minWidth:260 }}>
          <Field label="Section">
            <Sel value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              <option value="">Choose a section…</option>
              {sectionsSY.map((s) => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}
            </Sel>
          </Field>
        </div>
        <div style={{ minWidth:180 }}>
          <Field label="Month">
            <input type="month" value={ym} onChange={(e) => setYm(e.target.value)}
              style={{ fontFamily:T.body, outline:'none', border:`1px solid ${T.line}`, borderRadius:8,
                padding:'9px 11px', fontSize:13, width:'100%', boxSizing:'border-box' }} />
          </Field>
        </div>
        {sectionId && roster.length > 0 && (
          <div style={{ marginBottom:12 }}>
            <Btn onClick={doExport}>Export SF2 (Excel)</Btn>
          </div>
        )}
      </div>

      {!sectionId ? (
        <div style={S.card}>
          <EmptyState title="Pick a section" hint="Choose a section above to see its monthly attendance summary." />
        </div>
      ) : roster.length === 0 ? (
        <div style={S.card}>
          <EmptyState title="No learners enrolled here yet" hint="Enroll learners into this section on the Enrollment page first." />
        </div>
      ) : (
        <div style={{ ...S.card, padding:0, overflowX:'auto' }}>
          <table style={{ borderCollapse:'collapse', fontSize:12, width:'100%' }}>
            <thead>
              <tr style={{ background:T.paper }}>
                <th style={{ ...T.num, textAlign:'left', padding:'8px 10px', borderBottom:`1px solid ${T.line}`, position:'sticky', left:0, background:T.paper }}>#</th>
                <th style={{ textAlign:'left', padding:'8px 10px', borderBottom:`1px solid ${T.line}`, position:'sticky', left:28, background:T.paper, minWidth:160 }}>Name</th>
                {schoolDays.map((d) => (
                  <th key={d} style={{ ...T.num, textAlign:'center', padding:'8px 6px', borderBottom:`1px solid ${T.line}`, minWidth:28 }}>
                    {Number(d.slice(-2))}
                  </th>
                ))}
                <th style={{ ...T.num, textAlign:'center', padding:'8px 10px', borderBottom:`1px solid ${T.line}`, color:T.present }}>P</th>
                <th style={{ ...T.num, textAlign:'center', padding:'8px 10px', borderBottom:`1px solid ${T.line}`, color:T.absent }}>A</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((s, idx) => {
                const t = totals[s.id];
                return (
                  <tr key={s.id} style={{ borderBottom:`1px solid ${T.line}` }}>
                    <td style={{ ...T.num, padding:'8px 10px', position:'sticky', left:0, background:T.surface }}>{idx + 1}</td>
                    <td style={{ padding:'8px 10px', fontWeight:600, color:T.ink, position:'sticky', left:28, background:T.surface }}>{fullName(s)}</td>
                    {schoolDays.map((d) => {
                      const m = markFor(docsByDate, d, s.id);
                      return (
                        <td key={d} style={{ ...T.num, textAlign:'center', padding:'8px 6px', color:MARK_COLOR[m], fontWeight:700 }}>
                          {m === 'P' ? '' : m}
                        </td>
                      );
                    })}
                    <td style={{ ...T.num, textAlign:'center', padding:'8px 10px', fontWeight:700, color:T.present }}>{t.present}</td>
                    <td style={{ ...T.num, textAlign:'center', padding:'8px 10px', fontWeight:700, color:T.absent }}>{t.absent}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
