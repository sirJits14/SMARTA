import { useMemo, useState } from 'react';
import { useCollection } from '../hooks/useCollection.js';
import { fullName, depedSort } from '../lib/roster.js';
import { enrollStudent, withdrawEnrollment } from '../data/enrollments.js';
import { ENROLL_TYPE } from '../lib/constants.js';
import { T, S } from '../styles.js';
import { Btn, Sel, Field, Card, Confirm, EmptyState } from '../components/ui.jsx';

const sectionLabel = (s) => s ? `${s.name} · Grade ${s.gradeLevel}${s.strand ? ` · ${s.strand}` : ''}` : '—';

export default function EnrollPage({ schoolYear }) {
  const students = useCollection('students');
  const sections = useCollection('sections');
  const enrollments = useCollection('enrollments');

  const sectionsSY = useMemo(() =>
    sections
      .filter((s) => s.schoolYear === schoolYear)
      .sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name)),
    [sections, schoolYear]);

  const studentsSorted = useMemo(() => depedSort(students), [students]);

  const enrollmentFor = (studentId) =>
    enrollments.find((e) => e.studentId === studentId && e.schoolYear === schoolYear && e.status === 'enrolled');

  // Left pane: pick a section, see its class list.
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const selSection = sectionsSY.find((s) => s.id === selectedSectionId) || null;
  const classList = useMemo(() => {
    if (!selSection) return [];
    const ids = new Set(enrollments.filter((e) => e.sectionId === selSection.id && e.status === 'enrolled').map((e) => e.studentId));
    return depedSort(students.filter((s) => ids.has(s.id)));
  }, [enrollments, students, selSection]);
  const [confirmWithdraw, setConfirmWithdraw] = useState(null);

  // Right pane: enroll a learner.
  const [studentId, setStudentId] = useState('');
  const [type, setType] = useState(ENROLL_TYPE[0]);
  const [targetSectionId, setTargetSectionId] = useState('');
  const [confirmMove, setConfirmMove] = useState(null);

  const resetForm = () => { setStudentId(''); setType(ENROLL_TYPE[0]); setTargetSectionId(''); };

  const doEnroll = async () => {
    const student = students.find((s) => s.id === studentId);
    const section = sectionsSY.find((s) => s.id === targetSectionId);
    if (!student || !section) return;
    const existing = enrollmentFor(student.id);
    if (existing) {
      setConfirmMove({ student, section, existingSection: sections.find((s) => s.id === existing.sectionId) });
      return;
    }
    await enrollStudent({ student, section, schoolYear, type });
    resetForm();
  };

  const confirmMoveNow = async () => {
    const { student, section } = confirmMove;
    await enrollStudent({ student, section, schoolYear, type });
    setConfirmMove(null);
    resetForm();
  };

  return (
    <div>
      <div style={S.plate}>
        <h1 style={S.h1}>Enrollment</h1>
        <span style={{ ...T.num, fontSize: 12, color: T.manila, opacity: 0.75 }}>SY {schoolYear}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
        <Card style={{ padding: 20 }}>
          <h2 style={S.h2}>Class lists</h2>
          {sectionsSY.length === 0 ? (
            <EmptyState title="No sections yet" hint={`Add a section for SY ${schoolYear} before enrolling learners.`} />
          ) : (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {sectionsSY.map((s) => (
                  <Btn key={s.id} variant={s.id === selectedSectionId ? 'solid' : 'ghost'}
                    onClick={() => setSelectedSectionId(s.id)}>{sectionLabel(s)}</Btn>
                ))}
              </div>
              {!selSection ? (
                <EmptyState title="Pick a section" hint="Choose a section above to see its current class list." />
              ) : classList.length === 0 ? (
                <EmptyState title="No learners enrolled here yet" hint="Enroll a learner into this section using the form on the right." />
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead><tr style={S.thead}>
                      <th style={S.th}>Name</th>
                      <th style={S.th}></th>
                    </tr></thead>
                    <tbody>{classList.map((s) => (
                      <tr key={s.id}>
                        <td style={{ ...S.td, fontWeight: 600 }}>{fullName(s)}</td>
                        <td style={{ ...S.td, textAlign: 'right' }}>
                          <Btn variant="ghost" onClick={() => setConfirmWithdraw(s)} style={{ color: T.absent, borderColor: T.absent }}>Withdraw</Btn>
                        </td>
                      </tr>))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </Card>

        <Card style={{ padding: 20 }}>
          <h2 style={S.h2}>Enroll a learner</h2>
          {students.length === 0 ? (
            <EmptyState title="No learners yet" hint="Add learners on the Students page before enrolling them." />
          ) : sectionsSY.length === 0 ? (
            <EmptyState title="No sections yet" hint={`Add a section for SY ${schoolYear} before enrolling learners.`} />
          ) : (
            <>
              <Field label="Learner">
                <Sel value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                  <option value="">—</option>
                  {studentsSorted.map((s) => {
                    const en = enrollmentFor(s.id);
                    const tag = en ? ` — enrolled in ${sectionLabel(sections.find((x) => x.id === en.sectionId))}` : '';
                    return <option key={s.id} value={s.id}>{fullName(s)}{tag}</option>;
                  })}
                </Sel>
              </Field>
              <Field label="Enrollment type">
                <Sel value={type} onChange={(e) => setType(e.target.value)}>
                  {ENROLL_TYPE.map((t) => <option key={t} value={t}>{t}</option>)}
                </Sel>
              </Field>
              <Field label="Section">
                <Sel value={targetSectionId} onChange={(e) => setTargetSectionId(e.target.value)}>
                  <option value="">—</option>
                  {sectionsSY.map((s) => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}
                </Sel>
              </Field>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Btn onClick={doEnroll} disabled={!studentId || !targetSectionId}>Enroll</Btn>
              </div>
            </>
          )}
        </Card>
      </div>

      {confirmWithdraw && (
        <Confirm
          message={`Withdraw ${fullName(confirmWithdraw)} from ${sectionLabel(selSection)}?`}
          onYes={async () => { await withdrawEnrollment(confirmWithdraw.id, schoolYear, 'dropped'); setConfirmWithdraw(null); }}
          onNo={() => setConfirmWithdraw(null)}
          label="Withdraw"
          danger={false}
        />
      )}

      {confirmMove && (
        <Confirm
          message={`${fullName(confirmMove.student)} is already enrolled in ${sectionLabel(confirmMove.existingSection)} for SY ${schoolYear}. Enrolling again will move them to ${sectionLabel(confirmMove.section)}.`}
          onYes={confirmMoveNow}
          onNo={() => setConfirmMove(null)}
          label="Move learner"
          danger={false}
        />
      )}
    </div>
  );
}
