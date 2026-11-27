import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useDocResource } from '../../hooks/useCollection.js';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { ActionFeedback, Badge, Btn, Card, Confirm, EmptyState, Field, Sel } from '../../components/ui.jsx';
import { TempPassSheets, TEMP_PASS_LOGO_URL } from '../../components/TempPassPrintable.jsx';
import { issueTempPasses, revokeTempPass } from '../../data/tempPasses.js';
import { getStudentPhoto, photoDataUrl } from '../../data/photos.js';
import { passGrades } from '../../../shared/tempPass.js';
import { isAdmin } from '../../lib/access.js';
import { depedSort, fullName } from '../../lib/roster.js';
import { passRowStatus, passSectionLine, skipReasonText, mapWithLimit, loadImage, livePreviewCheck } from '../../lib/tempPass.js';
import { S, T } from '../../styles.js';

const sectionLabel = (s) => `Grade ${s.gradeLevel} - ${s.name}${s.strand ? ` · ${s.strand}` : ''}`;
const ISSUE_CHUNK = 200;
const PHOTO_CONCURRENCY = 4;
const QR_OPTIONS = { errorCorrectionLevel: 'M', margin: 2, width: 420 };

// Issues (or re-reads) passes for the chosen learners and gathers everything a
// card needs, with every picture decoded before the preview appears.
async function preparePasses({ ids, rowsById, section, principalName, principalTitle }) {
  const issued = []; const notPrepared = [];
  for (let i = 0; i < ids.length; i += ISSUE_CHUNK) {
    const result = await issueTempPasses(ids.slice(i, i + ISSUE_CHUNK));
    issued.push(...(result?.issued ?? []));
    for (const { studentId, reason } of result?.skipped ?? []) notPrepared.push({ studentId, reason });
  }
  await loadImage(TEMP_PASS_LOGO_URL);
  const cards = await mapWithLimit(issued, PHOTO_CONCURRENCY, async ({ studentId, code }) => {
    const student = rowsById.get(studentId)?.student;
    if (!student) return { skip: 'not-found', studentId };
    let photoSrc;
    try {
      photoSrc = photoDataUrl((await getStudentPhoto(studentId))?.photo);
      if (!photoSrc) return { skip: 'photo-unavailable', studentId };
      await loadImage(photoSrc);
    } catch { return { skip: 'photo-unavailable', studentId }; }
    let qrSrc;
    try {
      qrSrc = await QRCode.toDataURL(code, QR_OPTIONS);
      await loadImage(qrSrc);
    } catch { return { skip: 'qr-failed', studentId }; }
    return { studentId, code, name: fullName(student), sectionLine: passSectionLine(section), lrn: student.lrn,
      photoSrc, qrSrc, principalName, principalTitle };
  });
  for (const card of cards) if (card.skip) notPrepared.push({ studentId: card.studentId, reason: card.skip });
  return { items: cards.filter((card) => !card.skip), notPrepared };
}

export default function TempPassesTab({ me, schoolYear, sections, enrollments, students, passes, initialSectionId = '' }) {
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

  const passesById = useMemo(() => new Map(passes.map((p) => [p.id, p])), [passes]);
  const rows = useMemo(() => {
    if (!section) return [];
    const enrolledById = new Map(enrollments
      .filter((e) => e.sectionId === section.id && e.status === 'enrolled' && e.schoolYear === schoolYear)
      .map((e) => [e.studentId, e]));
    return depedSort(students.filter((s) => enrolledById.has(s.id))).map((student) => {
      const enrollment = enrolledById.get(student.id);
      const pass = passesById.get(student.id);
      return { student, pass, status: passRowStatus({ student, enrollment, section, schoolYear, pass }) };
    });
  }, [section, enrollments, students, passesById, schoolYear]);
  const rowsById = useMemo(() => new Map(rows.map((r) => [r.student.id, r])), [rows]);
  const printableIds = useMemo(() => rows.filter((r) => r.status.printable).map((r) => r.student.id), [rows]);
  const missingPhotos = rows.filter((r) => r.status.key === 'no-photo').length;

  const [picked, setPicked] = useState(() => new Set());
  // Only learners who can still print count, so a status change narrows the selection.
  const selected = useMemo(() => printableIds.filter((id) => picked.has(id)), [printableIds, picked]);
  const allSelected = printableIds.length > 0 && selected.length === printableIds.length;
  // The principal is part of the key: a Settings change must not leave old cards printable.
  const selectionKey = `${section?.id ?? ''}|${selected.join(',')}|${principalName}|${principalTitle}`;

  const action = useAsyncAction();
  const [preview, setPreview] = useState(null);
  const [revoking, setRevoking] = useState(null);
  const [notice, setNotice] = useState('');
  const run = useRef(0);
  const keyRef = useRef(selectionKey);
  keyRef.current = selectionKey;

  // A new section, selection or principal discards the preview and any preparation still running.
  useEffect(() => {
    run.current += 1;
    setPreview(null);
    setNotice('');
  }, [selectionKey]);

  // A prepared pass that stops being active with its code must not stay printable.
  const liveCheck = useMemo(() => (preview
    ? livePreviewCheck(preview.items, passesById, preview.confirmed)
    : null), [preview, passesById]);
  useEffect(() => {
    if (!liveCheck) return;
    if (liveCheck.stale) {
      setPreview(null);
      setNotice('A prepared pass is no longer active, so the preview was cleared. Prepare the passes again.');
      return;
    }
    if (liveCheck.confirmed.size !== preview.confirmed.size) setPreview((p) => (p ? { ...p, confirmed: liveCheck.confirmed } : p));
  }, [liveCheck, preview]);

  const chooseSection = (id) => { setSectionId(id); setPicked(new Set()); };
  const toggle = (id) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setPicked(allSelected ? new Set() : new Set(printableIds));

  const prepare = () => {
    const ticket = ++run.current;
    const startKey = selectionKey;
    setPreview(null);
    setNotice('');
    action.run('prepare', async () => {
      const result = await preparePasses({ ids: selected, rowsById, section, principalName, principalTitle });
      // A late answer for an earlier section or selection is ignored.
      if (ticket !== run.current || startKey !== keyRef.current) return;
      setPreview({ ...result, confirmed: new Set() });
    });
  };

  const nameOf = (studentId) => {
    const student = rowsById.get(studentId)?.student ?? students.find((s) => s.id === studentId);
    return student ? fullName(student) : studentId;
  };
  const preparing = action.pending.includes('prepare');
  const printReady = !!preview && preview.items.length > 0 && !!liveCheck?.allLive;

  return (
    <>
      <div className="id-cards-controls" style={{ fontFamily: T.body, color: T.ink }}>
        <Card style={{ padding: 20, marginBottom: 16 }}>
          <ActionFeedback action={action} />
          {notice && <p role="status" style={{ margin: '0 0 8px', fontSize: 13 }}>{notice}</p>}
          {principalMissing && (
            <p role="alert" className="sims-feedback">Add the principal's name and title in Settings before printing.</p>
          )}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ minWidth: 'min(260px, 100%)' }}>
              <Field label="Section">
                <Sel value={sectionId} onChange={(e) => chooseSection(e.target.value)}>
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
                <Btn loading={preparing} disabled={!canPrepare || selected.length === 0} onClick={prepare}>
                  {`Prepare passes (${selected.length})`}
                </Btn>
                {preview && preview.items.length > 0 && (
                  <Btn disabled={!printReady} onClick={() => window.print()}>{printReady ? 'Print' : 'Confirming passes…'}</Btn>
                )}
              </div>
            )}
          </div>
          {section && rows.length > 0 && (
            <p style={{ margin: '4px 0 0', fontSize: 13, color: T.inkMuted }}>{`${missingPhotos} missing a photo`}</p>
          )}
        </Card>

        {preview && preview.notPrepared.length > 0 && (
          <Card style={{ padding: 16, marginBottom: 16 }}>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 13 }}>
              {preview.notPrepared.map(({ studentId, reason }) => (
                <li key={studentId} style={{ padding: '4px 0' }}>{`Not prepared: ${nameOf(studentId)} — ${skipReasonText(reason)}`}</li>
              ))}
            </ul>
          </Card>
        )}

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
                      <td style={S.td}><Badge tone={status.tone}>{status.label}</Badge></td>
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
