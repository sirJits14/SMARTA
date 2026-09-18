import { useEffect, useState } from 'react';
import { Modal, Btn, EmptyState } from '../components/ui.jsx';
import { fullName } from '../lib/roster.js';
import { T, S } from '../styles.js';

const sectionLabel = (s) => `Grade ${s.gradeLevel} - ${s.name}${s.strand ? ` · ${s.strand}` : ''}`;

export default function SectionDetailModal({ section, roster, onClose, onEditStudent }) {
  const [printReady, setPrintReady] = useState(false);
  useEffect(() => {
    setPrintReady(false);
    const timer = setTimeout(() => setPrintReady(true), 300);
    return () => clearTimeout(timer);
  }, [section?.id]);
  return (
    <Modal onClose={onClose} overlayClassName="section-detail-modal-overlay" width={720}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div>
          <h2 style={{ fontFamily: T.display, color: T.ink, margin: 0, fontSize: 17, fontWeight: 600 }}>{sectionLabel(section)}</h2>
          <div style={{ fontFamily: T.body, fontSize: 12, color: T.inkMuted, marginTop: 4 }}>{section.adviserName || 'No adviser assigned'} · {roster.length} enrolled</div>
        </div>
        {roster.length > 0 && (
          <Btn onClick={() => window.print()} disabled={!printReady}>
            {printReady ? 'Print QR Codes' : 'Preparing QR codes…'}
          </Btn>
        )}
      </div>
      {roster.length === 0 ? (
        <EmptyState title="No learners enrolled here yet" hint="Enroll learners into this section on the Enrollment page first." />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={S.thead}>
              {['LRN', 'Name', 'Sex', ''].map((h) => <th key={h} style={S.th}>{h}</th>)}
            </tr></thead>
            <tbody>{roster.map((s) => (
              <tr key={s.id}>
                <td style={{ ...S.td, ...T.num }}>{s.lrn}</td>
                <td style={{ ...S.td, fontWeight: 600 }}>{fullName(s)}</td>
                <td style={S.td}>{s.sex}</td>
                <td style={{ ...S.td, textAlign: 'right' }}>
                  <Btn variant="ghost" onClick={() => onEditStudent(s)}>Edit</Btn>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <Btn variant="ghost" onClick={onClose}>Close</Btn>
      </div>
    </Modal>
  );
}
