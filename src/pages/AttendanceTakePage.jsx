import { useEffect, useMemo, useState } from 'react';
import { useCollection, useDoc } from '../hooks/useCollection.js';
import { fullName, depedSort } from '../lib/roster.js';
import { localDate } from '../lib/dates.js';
import { markFor, formatScanTime } from '../lib/attendance.js';
import { attendanceId, saveMarks } from '../data/attendance.js';
import { MARK_LABEL } from '../lib/constants.js';
import { T, S } from '../styles.js';
import { Sel, Inp, Btn, Field, Card, StatusPill, EmptyState } from '../components/ui.jsx';

const sectionLabel = (s) => s ? `${s.name} · Grade ${s.gradeLevel}${s.strand ? ` · ${s.strand}` : ''}` : '—';

// Cycling one tap at a time: Present -> Late -> Absent -> Excused -> Present.
const NEXT = { P: 'L', L: 'A', A: 'E', E: 'P' };

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
    setMarks((prev) => ({ ...prev, [studentId]: NEXT[prev[studentId] ?? markFor(docsByDate, date, studentId)] }));
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
      await saveMarks({ sectionId, date, schoolYear, marks });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <style>{`
        .stamp-row { transition: background 120ms ease; }
        @media (prefers-reduced-motion: reduce) { .stamp-row { transition: none; } }
        .stamp-row:focus-visible { outline: 2px solid ${T.primary}; outline-offset: -2px; }
        .stamp-row:hover { background: rgba(91,79,232,0.05); }
      `}</style>

      <div style={S.plate}>
        <h1 style={S.h1}>Attendance</h1>
      </div>

      <Card style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 260 }}>
            <Field label="Section">
              <Sel value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                <option value="">Choose a section…</option>
                {sectionsSY.map((s) => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}
              </Sel>
            </Field>
          </div>
          <div style={{ minWidth: 180 }}>
            <Field label="Date">
              <Inp type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
        </div>
      </Card>

      {!sectionId ? (
        <Card style={{ padding: 20 }}><EmptyState title="Pick a section" hint="Choose a section above to start taking attendance." /></Card>
      ) : roster.length === 0 ? (
        <Card style={{ padding: 20 }}><EmptyState title="No learners enrolled here yet" hint="Enroll learners into this section on the Enrollment page first." /></Card>
      ) : (
        <>
          {/* Tally ribbon */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <TallyChip label="Present" value={tally.present} sub={tally.late ? `${tally.late} late` : null} color={T.present} />
            <TallyChip label="Absent" value={tally.absent} color={T.absent} />
            <TallyChip label="Excused" value={tally.excused} color={T.excused} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 18px 8px' }}>
            <span style={{ ...S.th, width: 110, flexShrink: 0, padding: 0, borderBottom: 'none' }}>LRN</span>
            <span style={{ ...S.th, flex: 1, padding: 0, borderBottom: 'none' }}>Name</span>
            <span style={{ ...S.th, width: 78, flexShrink: 0, textAlign: 'center', padding: 0, borderBottom: 'none' }}>Time In</span>
            <span style={{ ...S.th, width: 78, flexShrink: 0, textAlign: 'center', padding: 0, borderBottom: 'none' }}>Time Out</span>
            <span style={{ ...S.th, flexShrink: 0, padding: 0, borderBottom: 'none' }}>Status</span>
          </div>

          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {roster.map((s, i) => {
              const mark = shownMark(s.id);
              const timeIn = attendanceDoc?.timeIn?.[s.id];
              const timeOut = attendanceDoc?.timeOut?.[s.id];
              const scanLabel = `${timeIn ? ` Time in ${formatScanTime(timeIn)}.` : ''}${timeOut ? ` Time out ${formatScanTime(timeOut)}.` : ''}`;
              return (
                <div
                  key={s.id}
                  className="stamp-row"
                  role="button"
                  tabIndex={0}
                  aria-label={`${fullName(s)}, currently marked ${MARK_LABEL[mark]}.${scanLabel} Activate to change.`}
                  onClick={() => cycle(s.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cycle(s.id); } }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer',
                    padding: '13px 18px', userSelect: 'none',
                    borderBottom: i === roster.length - 1 ? 'none' : `1px solid ${T.border}`,
                  }}
                >
                  <span style={{ ...T.num, fontSize: 12, color: T.ink, opacity: 0.6, width: 110, flexShrink: 0 }}>{s.lrn}</span>
                  <span style={{ flex: 1, fontFamily: T.display, fontSize: 14, fontWeight: 600, color: T.ink }}>{fullName(s)}</span>
                  <span style={{ ...T.num, fontSize: 12, color: T.inkMuted, width: 78, flexShrink: 0, textAlign: 'center' }}>{formatScanTime(timeIn)}</span>
                  <span style={{ ...T.num, fontSize: 12, color: T.inkMuted, width: 78, flexShrink: 0, textAlign: 'center' }}>{formatScanTime(timeOut)}</span>
                  <StatusPill mark={mark} />
                </div>
              );
            })}
          </Card>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end', marginTop: 16 }}>
            {saved && <span style={{ fontFamily: T.body, fontSize: 13, color: T.present, fontWeight: 600 }}>Saved ✓</span>}
            <Btn onClick={doSave} disabled={saving}>{saving ? 'Saving…' : 'Save attendance'}</Btn>
          </div>
        </>
      )}
    </div>
  );
}

function TallyChip({ label, value, sub, color }) {
  return (
    <Card style={{ padding: '9px 16px', display: 'flex', alignItems: 'baseline', gap: 9 }}>
      <span style={{ width: 9, height: 9, borderRadius: T.radius, background: color, display: 'inline-block', flexShrink: 0 }} />
      <span style={{ fontFamily: T.body, fontSize: 12, fontWeight: 600, color: T.ink, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</span>
      <span style={{ ...T.num, fontSize: 18, fontWeight: 700, color }}>{value}</span>
      {sub && <span style={{ ...T.num, fontSize: 11, color: T.ink, opacity: 0.55 }}>({sub})</span>}
    </Card>
  );
}
