import { useMemo, useState } from 'react';
import { useCollection } from '../hooks/useCollection.js';
import { depedSort } from '../lib/roster.js';
import { S } from '../styles.js';
import { Sel, Field, Btn, Card, EmptyState } from '../components/ui.jsx';
import IdCardsPrintSheets from '../components/IdCardsPrintable.jsx';

const sectionLabel = (s) => s ? `Grade ${s.gradeLevel} - ${s.name}${s.strand ? ` · ${s.strand}` : ''}` : '—';

export default function IDCardsPage({ schoolYear }) {
  const sections = useCollection('sections');
  const enrollments = useCollection('enrollments');
  const students = useCollection('students');

  const sectionsSY = useMemo(() =>
    sections
      .filter((s) => s.schoolYear === schoolYear)
      .sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name)),
    [sections, schoolYear]);

  const [sectionId, setSectionId] = useState('');
  const section = sectionsSY.find((s) => s.id === sectionId) || null;

  const roster = useMemo(() => {
    if (!section) return [];
    const ids = new Set(enrollments.filter((e) => e.sectionId === section.id && e.status === 'enrolled').map((e) => e.studentId));
    return depedSort(students.filter((s) => ids.has(s.id)));
  }, [enrollments, students, section]);

  return (
    <div>
      <div className="id-cards-heading" style={S.plate}>
        <h1 style={S.h1}>ID Cards</h1>
      </div>

      <Card className="id-cards-controls" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: 260 }}>
            <Field label="Section">
              <Sel value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                <option value="">Choose a section…</option>
                {sectionsSY.map((s) => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}
              </Sel>
            </Field>
          </div>
          {section && roster.length > 0 && (
            <div style={{ marginBottom: 12 }}><Btn onClick={() => window.print()}>Print</Btn></div>
          )}
        </div>
      </Card>

      {!section ? (
        <Card style={{ padding: 20 }}><EmptyState title="Pick a section" hint="Choose a section above to generate ID cards for its enrolled learners." /></Card>
      ) : roster.length === 0 ? (
        <Card style={{ padding: 20 }}><EmptyState title="No learners enrolled here yet" hint="Enroll learners into this section on the Enrollment page first." /></Card>
      ) : (
        <IdCardsPrintSheets roster={roster} section={section} />
      )}
    </div>
  );
}
