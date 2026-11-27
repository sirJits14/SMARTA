import { useEffect, useRef, useState } from 'react';
import S from '../../strings.js';
import { callable } from '../../firebase.js';
import { schoolError } from '../../lib/school.js';
import { photoCountText } from '../../lib/studentPhoto.js';
import { useStudentPhoto } from '../../hooks/useStudentPhoto.js';
import { Banner, Btn } from '../../components/ui.jsx';
import Sheet from '../../components/Sheet.jsx';
import PhotoCropper from '../../components/PhotoCropper.jsx';

// The newest photo known for a learner: the class list's, or one saved in this
// sheet that the list has not caught up with.
const versionOf = (row, saved) => Math.max(row.photoUpdatedAt || 0, saved[row.studentId] || 0) || undefined;

// The class list, kept apart from the portal so it can be rendered on its own in tests.
// `focusId` puts the adviser back on the learner they just left.
export function PhotosList({ rows, saved = {}, focusId = '', onPick, onClose }) {
  const done = rows.filter((row) => versionOf(row, saved)).length;
  return (
    <>
      <p className="class-note">{photoCountText(done, rows.length)}</p>
      <ul className="photo-list">
        {rows.map((row) => {
          const has = Boolean(versionOf(row, saved));
          const action = has ? S.photoReplace : S.photoAdd;
          return (
            <li key={row.studentId} className="photo-row">
              <span className="photo-row-body">
                <span className="photo-row-name">{row.displayName}</span>
                <span className="photo-row-status">{has ? S.photoAdded : S.photoMissing}</span>
              </span>
              <Btn variant="ghost" autoFocus={row.studentId === focusId} aria-label={`${action}: ${row.displayName}`} onClick={() => onPick(row.studentId)}>{action}</Btn>
            </li>
          );
        })}
      </ul>
      <div className="photo-foot">
        <Btn variant="ghost" onClick={onClose}>{S.photosClose}</Btn>
      </div>
    </>
  );
}

// One learner: the photo held now, the cropper, and Save.
export function PhotoEditor({ row, version, current, busy, error, ready, onReady, onSave, onBack }) {
  const heading = useRef(null);
  // The button that opened this view is gone, so focus moves to the name; this also scrolls the sheet to it.
  useEffect(() => { heading.current?.focus(); }, []);
  return (
    <>
      <div className="photo-learner">
        {version && (current
          ? <img className="photo-current" src={current} alt={S.photoCurrent} />
          : <span className="photo-current" aria-hidden="true" />)}
        <div className="photo-row-body">
          <h3 ref={heading} tabIndex={-1} className="photo-row-name">{row.displayName}</h3>
          <span className="photo-row-status">{version ? S.photoAdded : S.photoMissing}</span>
        </div>
      </div>
      <PhotoCropper onReady={onReady} disabled={busy} />
      <div className="photo-foot">
        {/* In the foot, so a failed save is seen beside the button that was tapped. */}
        {error && <Banner tone="danger">{error}</Banner>}
        <Btn variant="ghost" disabled={busy} onClick={onBack}>{S.back}</Btn>
        <Btn disabled={busy || !ready} onClick={onSave}>{busy ? S.photoSaving : S.photoSave}</Btn>
      </div>
    </>
  );
}

// An adviser's learner photos: pick a learner, crop a picture, save it.
export default function PhotosSheet({ rows, onSaved, onClose }) {
  const [pickedId, setPickedId] = useState('');
  const [lastId, setLastId] = useState('');
  const [draft, setDraft] = useState(null); // { studentId, content }: the crop ready to save, and whose it is
  const [saved, setSaved] = useState({}); // studentId -> updatedAt
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const row = rows.find((r) => r.studentId === pickedId);
  const version = row && versionOf(row, saved);
  const current = useStudentPhoto(row?.studentId, version);
  const ready = Boolean(row) && draft?.studentId === row.studentId;

  const show = (studentId) => { setDraft(null); setError(''); setPickedId(studentId); if (studentId) setLastId(studentId); };

  const save = async () => {
    if (!ready || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    const { studentId, content } = draft;
    try {
      const { data } = await callable('saveStudentPhotoFn')({ studentId, contentBase64: content });
      setSaved((all) => ({ ...all, [studentId]: data.updatedAt }));
      show('');
      onSaved();
    } catch (e) { setError(schoolError(e, S.photoSaveFailed)); }
    finally { lock.current = false; setBusy(false); }
  };

  // The hint introduces the list; one learner's view needs the room for the picture.
  return (
    <Sheet title={S.photosTitle} hint={row ? undefined : S.photosHint} busy={busy} onClose={onClose}>
      {row ? (
        // Keyed by learner, so a picture chosen for one can never carry over to another.
        <PhotoEditor key={row.studentId} row={row} version={version} current={current} busy={busy} error={error} ready={ready}
          onReady={(content) => setDraft(content ? { studentId: row.studentId, content } : null)} onSave={save} onBack={() => show('')} />
      ) : <PhotosList rows={rows} saved={saved} focusId={lastId} onPick={show} onClose={onClose} />}
    </Sheet>
  );
}
