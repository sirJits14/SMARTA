import { useMemo, useState } from 'react';
import { useDocResource } from '../../hooks/useCollection.js';
import { Badge, Btn, Card, Confirm, EmptyState, Field, Sel } from '../../components/ui.jsx';
import { TempPassSheets } from '../../components/TempPassPrintable.jsx';
import { revokeTempPass } from '../../data/tempPasses.js';
import { passGrades } from '../../../shared/tempPass.js';
import { isAdmin } from '../../lib/access.js';
import { depedSort, fullName } from '../../lib/roster.js';
import { passRowStatus, previewKey } from '../../lib/tempPass.js';
import { S, T } from '../../styles.js';
import { usePassPrinting } from './usePassPrinting.js';
import { NotPreparedList, PrintButtons, PrintMessages } from './PassPrintParts.jsx';

const sectionLabel = (s) => `Grade ${s.gradeLevel} - ${s.name}${s.strand ? ` · ${s.strand}` : ''}`;
const NO_REQUESTS = { requests: [] };

// pending: the waiting requests ({ requests }) from listTempPassRequests. A learner with one is
// prepared through it, and "Mark as printed" then closes it, exactly as in the Requests tab.
export default function TempPassesTab({ me, schoolYear, sections, enrollments, students, passes, pending = NO_REQUESTS, onRequestsChanged, initialSectionId = '' }) {
  const admin = isAdmin(me);
  const grades = passGrades(me);
  const settingsResource = useDocResource('settings/app');
  const principalName = String(settingsResource.data?.principalName ?? '').trim();
  const principalTitle = String(settingsResource.data?.principalTitle ?? '').trim();
  const principalMissing = !settingsResource.loading && (!principalName || !principalTitle);
  const canPrepare = !settingsResource.loading && !principalMissing;

  const sectionsSY = useMemo(() => sections
    .filter((s) => s.schoolYear === schoolYear && (grades === null || grades.includes(Number(s.gradeLevel))))
    .sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name)),
  [sections, schoolYear, grades]);
  const [sectionId, setSectionId] = useState(initialSectionId);
  const section = sectionsSY.find((s) => s.id === sectionId) || null;

  const livePasses = useMemo(() => new Map(passes.map((p) => [p.id, p])), [passes]);
  const rows = useMemo(() => {
    if (!section) return [];
    const enrolledById = new Map(enrollments
      .filter((e) => e.sectionId === section.id && e.status === 'enrolled' && e.schoolYear === schoolYear)
      .map((e) => [e.studentId, e]));
    return depedSort(students.filter((s) => enrolledById.has(s.id))).map((student) => {
      const enrollment = enrolledById.get(student.id);
      const pass = livePasses.get(student.id);
      return { student, pass, status: passRowStatus({ student, enrollment, section, schoolYear, pass }) };
    });
  }, [section, enrollments, students, livePasses, schoolYear]);
  const rowsById = useMemo(() => new Map(rows.map((r) => [r.student.id, r])), [rows]);
  const printableIds = useMemo(() => rows.filter((r) => r.status.printable).map((r) => r.student.id), [rows]);
  const withoutPhoto = rows.filter((r) => !r.student.photo?.path).length;
  const requestOf = useMemo(() => new Map((pending?.requests ?? [])
    .filter((r) => r.status === 'pending' && r.studentId).map((r) => [r.studentId, r])), [pending]);

  const [picked, setPicked] = useState(() => new Set());
  // Only learners who can still print count, so a status change narrows the selection.
  const selected = useMemo(() => printableIds.filter((id) => picked.has(id)), [printableIds, picked]);
  const allSelected = printableIds.length > 0 && selected.length === printableIds.length;
  // Section, selection, each learner's printed name, LRN, photo and request, and the principal:
  // a change to any of them must not leave old cards printable.
  const selectionKey = previewKey({ sectionId: section?.id, principalName, principalTitle,
    learners: selected.map((id) => {
      const s = rowsById.get(id).student;
      return { id, name: fullName(s), lrn: s.lrn, requestId: requestOf.get(id)?.id, photo: s.photo?.path };
    }) });

  const printing = usePassPrinting({ principalName, principalTitle, passesById: livePasses, selectionKey,
    onPrepared: onRequestsChanged, onMarked: onRequestsChanged });
  const { preview, preparing } = printing;
  const [revoking, setRevoking] = useState(null);

  const chooseSection = (id) => { setSectionId(id); setPicked(new Set()); };
  const toggle = (id) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setPicked(allSelected ? new Set() : new Set(printableIds));
  const prepare = () => printing.prepare(selected.map((id) => ({
    studentId: id, requestId: requestOf.get(id)?.id, student: rowsById.get(id).student, section,
  })));

  const nameOf = ({ studentId }) => {
    const student = rowsById.get(studentId)?.student ?? students.find((s) => s.id === studentId);
    return student ? fullName(student) : 'A learner';
  };

  return (
    <>
      <div className="id-cards-controls" style={{ fontFamily: T.body, color: T.ink }}>
        <Card style={{ padding: 20, marginBottom: 16 }}>
          <PrintMessages printing={printing} admin={admin} principalMissing={principalMissing} />
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ minWidth: 'min(260px, 100%)' }}>
              <Field label="Section">
                <Sel value={sectionId} disabled={preparing} onChange={(e) => chooseSection(e.target.value)}>
                  <option value="">Choose a section…</option>
                  {sectionsSY.map((s) => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}
                </Sel>
              </Field>
            </div>
            {section && rows.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <Btn variant="ghost" disabled={printableIds.length === 0 || preparing} onClick={toggleAll}>
                  {allSelected ? 'Clear selection' : 'Select all printable'}
                </Btn>
                <PrintButtons printing={printing} count={selected.length} canPrepare={canPrepare} onPrepare={prepare} />
              </div>
            )}
          </div>
          {section && withoutPhoto > 0 && (
            <p style={{ margin: '4px 0 0', fontSize: 13, color: T.inkMuted }}>{`${withoutPhoto} without a photo: their passes print a frame to attach one.`}</p>
          )}
        </Card>

        <NotPreparedList preview={preview} nameOf={nameOf} />

        {!section ? (
          <Card style={{ padding: 20, marginBottom: 16 }}>
            <EmptyState title="Pick a section" hint="Choose a section above to prepare temporary ID passes for learners without an official ID." />
          </Card>
        ) : rows.length === 0 ? (
          <Card style={{ padding: 20, marginBottom: 16 }}>
            <EmptyState title="No learners enrolled here yet" hint="Learners enrolled in this section appear here." />
          </Card>
        ) : (
          <Card style={{ marginBottom: 16 }}>
            <div className="sims-table-scroll" role="region" aria-label="Learners" tabIndex={0}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={S.thead}>
                  <th style={{ ...S.th, width: 1 }}><span className="sims-sr-only">Select</span></th>
                  <th style={S.th}>Name</th><th style={S.th}>LRN</th><th style={S.th}>Status</th>
                  {admin && <th style={S.th}><span className="sims-sr-only">Actions</span></th>}
                </tr></thead>
                <tbody>{rows.map(({ student, status }) => {
                  const name = fullName(student);
                  return (
                    <tr key={student.id}>
                      <td style={S.td}>
                        <input type="checkbox" aria-label={`Select ${name}`} checked={selected.includes(student.id)}
                          disabled={!status.printable || preparing} onChange={() => toggle(student.id)} />
                      </td>
                      <td style={S.tdStrong}>{name}</td>
                      <td style={{ ...S.td, ...T.num }}>{student.lrn || '—'}</td>
                      <td style={S.td}>
                        <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                          <Badge tone={status.tone}>{status.label}</Badge>
                          {requestOf.has(student.id) && <Badge tone="accent">Requested</Badge>}
                        </span>
                      </td>
                      {admin && <td style={S.tdActions}>
                        {status.key === 'active' && (
                          <Btn variant="ghost-danger" aria-label={`Revoke the pass for ${name}`} onClick={() => setRevoking(student)}>Revoke</Btn>
                        )}
                      </td>}
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {preview && preview.items.length > 0 && <TempPassSheets passes={preview.items} />}
      {revoking && (
        <Confirm title="Revoke pass?" label="Revoke"
          message="The QR on this learner's temporary pass will stop working."
          onYes={async () => { await revokeTempPass(revoking.id); setRevoking(null); }}
          onNo={() => setRevoking(null)} />
      )}
    </>
  );
}
