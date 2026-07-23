import { useEffect, useMemo, useState } from 'react';
import { useCollection, useDoc } from '../hooks/useCollection.js';
import { fullName, depedSort } from '../lib/roster.js';
import { localDate } from '../lib/dates.js';
import { markFor } from '../lib/attendance.js';
import { attendanceId, saveMarks } from '../data/attendance.js';
import { MARK_LABEL } from '../lib/constants.js';
import { T, S, MARK_COLOR } from '../styles.js';
import { Sel, Inp, Btn, Field, EmptyState } from '../components/ui.jsx';

const sectionLabel = (s) => s ? `${s.name} · Grade ${s.gradeLevel}${s.strand ? ` · ${s.strand}` : ''}` : '—';

// Cycling one tap at a time: Present -> Late -> Absent -> Excused -> Present.
const NEXT = { P:'L', L:'A', A:'E', E:'P' };

export default function AttendanceTakePage({ schoolYear }) {
  const sections = useCollection('sections');
  const enrollments = useCollection('enrollments');
  const students = useCollection('students');

  const sectionsSY = useMemo(() =>
    sections
      .filter((s) => s.schoolYear === schoolYear)
      .sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name)),
    [sections, schoolYear]);

  const [sectionId, setSectionId] = useState('');
  const [date, setDate] = useState(localDate());

  const roster = useMemo(() => {
    if (!sectionId) return [];
    const ids = new Set(enrollments.filter((e) => e.sectionId === sectionId && e.status === 'enrolled').map((e) => e.studentId));
    return depedSort(students.filter((s) => ids.has(s.id)));
  }, [enrollments, students, sectionId]);

  const attendanceDoc = useDoc(`student_attendance/${attendanceId(sectionId || '_none_', date)}`);

  const [marks, setMarks] = useState({});
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // `marks` holds ONLY the taps the registrar has made this session — a session-override
  // map, not a full seeded snapshot. Clear overrides only when the section or date changes,
  // so unrelated collection churn (students/enrollments onSnapshot firing on any write) can
  // never reset or clobber unsaved taps.
  useEffect(() => { setMarks({}); setSaved(false); }, [sectionId, date]);

  const docsByDate = attendanceDoc ? { [date]: attendanceDoc } : {};
  const shownMark = (id) => marks[id] ?? markFor(docsByDate, date, id);

  const cycle = (studentId) => {
    setMarks((prev) => ({ ...prev, [studentId]: NEXT[shownMark(studentId)] }));
    setSaved(false);
  };

  const tally = useMemo(() => {
    let present = 0, late = 0, absent = 0, excused = 0;
    for (const s of roster) {
      const m = shownMark(s.id);
      if (m === 'A') absent++;
      else if (m === 'E') excused++;
      else { present++; if (m === 'L') late++; }
    }
    return { present, late, absent, excused };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster, marks, attendanceDoc, date]);

  const doSave = async () => {
    setSaving(true);
    try {
      const full = {};
      for (const s of roster) full[s.id] = shownMark(s.id);
      await saveMarks({ sectionId, date, schoolYear, marks: full });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <style>{`
        .stamp-row { transition: border-color 120ms ease, background 120ms ease; }
        @media (prefers-reduced-motion: reduce) { .stamp-row { transition: none; } }
        .stamp-row:focus-visible { outline: 2px solid ${T.ink}; outline-offset: 2px; }
        .stamp-row:hover { background: ${T.paper}; }
      `}</style>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <h1 style={{ fontFamily:T.display, margin:0 }}>Attendance</h1>
        <span style={{ ...T.num, fontSize:13, color:T.excused }}>SY {schoolYear}</span>
      </div>

      <div style={{ display:'flex', gap:16, marginBottom:16, flexWrap:'wrap' }}>
        <div style={{ minWidth:260 }}>
          <Field label="Section">
            <Sel value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              <option value="">Choose a section…</option>
              {sectionsSY.map((s) => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}
            </Sel>
          </Field>
        </div>
        <div style={{ minWidth:180 }}>
          <Field label="Date">
            <Inp type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
      </div>

      {!sectionId ? (
        <div style={S.card}>
          <EmptyState title="Pick a section" hint="Choose a section above to start taking attendance." />
        </div>
      ) : roster.length === 0 ? (
        <div style={S.card}>
          <EmptyState title="No learners enrolled here yet" hint="Enroll learners into this section on the Enrollment page first." />
        </div>
      ) : (
        <>
          {/* Tally ribbon */}
          <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:16 }}>
            <TallyChip label="Present" value={tally.present} sub={tally.late ? `${tally.late} late` : null} color={T.present} />
            <TallyChip label="Absent" value={tally.absent} color={T.absent} />
            <TallyChip label="Excused" value={tally.excused} color={T.excused} />
          </div>

          <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
            {roster.map((s, i) => {
              const mark = shownMark(s.id);
              return (
                <div
                  key={s.id}
                  className="stamp-row"
                  role="button"
                  tabIndex={0}
                  aria-label={`${fullName(s)}, currently marked ${MARK_LABEL[mark]}. Activate to change.`}
                  onClick={() => cycle(s.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cycle(s.id); } }}
                  style={{
                    display:'flex', alignItems:'center', gap:16, cursor:'pointer',
                    padding:'14px 18px', userSelect:'none',
                    borderLeft:`6px solid ${MARK_COLOR[mark]}`,
                    borderBottom: i === roster.length - 1 ? 'none' : `1px solid ${T.line}`,
                  }}
                >
                  <span style={{ ...T.num, fontSize:12, color:T.excused, width:110, flexShrink:0 }}>{s.lrn}</span>
                  <span style={{ flex:1, fontSize:14, fontWeight:600, color:T.ink }}>{fullName(s)}</span>
                  <span style={{
                    ...T.num, fontSize:12, fontWeight:700, color:MARK_COLOR[mark],
                    border:`1px solid ${MARK_COLOR[mark]}`, borderRadius:999,
                    padding:'4px 12px', flexShrink:0,
                  }}>{MARK_LABEL[mark]}</span>
                </div>
              );
            })}
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:12, justifyContent:'flex-end', marginTop:16 }}>
            {saved && <span style={{ ...T.num, fontSize:13, color:T.present, fontWeight:600 }}>Saved ✓</span>}
            <Btn onClick={doSave} disabled={saving}>{saving ? 'Saving…' : 'Save attendance'}</Btn>
          </div>
        </>
      )}
    </div>
  );
}

function TallyChip({ label, value, sub, color }) {
  return (
    <div style={{ ...S.card, padding:'10px 18px', display:'flex', alignItems:'baseline', gap:8 }}>
      <span style={{ width:10, height:10, borderRadius:999, background:color, display:'inline-block' }} />
      <span style={{ fontSize:13, fontWeight:600, color:T.ink }}>{label}</span>
      <span style={{ ...T.num, fontSize:18, fontWeight:700, color }}>{value}</span>
      {sub && <span style={{ ...T.num, fontSize:12, color:T.excused }}>({sub})</span>}
    </div>
  );
}
