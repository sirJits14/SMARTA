import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { useCollection } from '../hooks/useCollection.js';
import { fullName, depedSort } from '../lib/roster.js';
import { T, S } from '../styles.js';
import { Sel, Field, Btn, Card, EmptyState } from '../components/ui.jsx';

const sectionLabel = (s) => s ? `Grade ${s.gradeLevel} - ${s.name}${s.strand ? ` · ${s.strand}` : ''}` : '—';

const SHEET_SIZE = 16;

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function IDCard({ student, section }) {
  const [qrSrc, setQrSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(student.lrn)
      .then((url) => { if (!cancelled) setQrSrc(url); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [student.lrn]);

  return (
    <div className="id-card" style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: 16, textAlign: 'center', boxShadow: T.cardShadow }}>
      {qrSrc ? (
        <img className="id-card-qr" src={qrSrc} alt={`QR code for LRN ${student.lrn}`} width={140} height={140} style={{ display: 'block', margin: '0 auto 10px' }} />
      ) : failed ? (
        <div className="id-card-qr" style={{ width: 140, height: 140, margin: '0 auto 10px', display: 'grid', placeItems: 'center', border: `1px dashed ${T.border}`, borderRadius: 8 }}>
          <span style={{ ...T.num, fontSize: 11, color: T.inkMuted }}>QR unavailable</span>
        </div>
      ) : (
        <div className="id-card-qr" style={{ width: 140, height: 140, margin: '0 auto 10px' }} />
      )}
      <div className="id-card-name" style={{ fontFamily: T.body, fontWeight: 700, fontSize: 13, color: T.ink }}>{fullName(student)}</div>
      <div className="id-card-lrn" style={{ ...T.num, fontSize: 12, color: T.inkMuted, marginTop: 2 }}>{student.lrn}</div>
      <div className="id-card-section" style={{ fontFamily: T.body, fontSize: 11, color: T.inkMuted, marginTop: 2 }}>{sectionLabel(section)}</div>
    </div>
  );
}

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

  const sheets = useMemo(() => chunk(roster, SHEET_SIZE), [roster]);

  return (
    <div>
      <style>{`
        .id-cards-sheet { display: contents; }
        @media print {
          .app-sidebar, .app-topbar, .id-cards-controls { display: none !important; }
          .app-shell { grid-template-columns: 1fr !important; }
          main { padding: 0 !important; }
          @page { size: A4; margin: 8mm; }
          .id-cards-grid { display: block !important; }
          .id-cards-sheet {
            display: grid !important;
            grid-template-columns: repeat(4, 1fr);
            grid-template-rows: repeat(4, 1fr);
            width: 194mm;
            height: 281mm;
            gap: 4mm;
          }
          .id-cards-sheet:not(:last-child) { break-after: page; }
          .id-card { padding: 3mm !important; }
          .id-card-qr { width: 32mm !important; height: 32mm !important; margin: 0 auto 2mm !important; }
          .id-card-name { font-size: 9pt !important; }
          .id-card-lrn { font-size: 8pt !important; }
          .id-card-section { font-size: 7pt !important; }
        }
      `}</style>

      <div style={S.plate}>
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
        <div className="id-cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
          {sheets.map((sheet, i) => (
            <div className="id-cards-sheet" key={i}>
              {sheet.map((s) => <IDCard key={s.id} student={s} section={section} />)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
