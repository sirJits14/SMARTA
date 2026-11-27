import { useEffect, useRef, useState } from 'react';
import { getStudentPhoto, saveStudentPhoto, photoDataUrl } from '../data/photos.js';
import { useAsyncAction } from '../hooks/useAsyncAction.js';
import { fullName } from '../lib/roster.js';
import PhotoCropper from './PhotoCropper.jsx';
import { Modal, Btn, ActionFeedback } from './ui.jsx';

export default function StudentPhotoDialog({ student, onClose }) {
  const action = useAsyncAction();
  const [current, setCurrent] = useState({ status: 'loading', url: '' });
  const [photo, setPhoto] = useState(''); // base64 of the new crop; '' until one is ready
  const open = useRef(true);
  useEffect(() => { open.current = true; return () => { open.current = false; }; }, []);
  useEffect(() => {
    let live = true;
    setCurrent({ status: 'loading', url: '' });
    const load = async () => {
      try {
        const url = photoDataUrl((await getStudentPhoto(student.id)).photo);
        if (live) setCurrent({ status: 'ready', url });
      } catch {
        if (live) setCurrent({ status: 'failed', url: '' });
      }
    };
    load();
    return () => { live = false; };
  }, [student.id]);

  const save = () => action.run('save', async () => {
    await saveStudentPhoto(student.id, photo);
    // A save that outlives this dialog must not close the next one.
    if (open.current) onClose();
  });

  return (
    <Modal title={`Photo · ${fullName(student)}`} onClose={onClose} dismissible={!action.busy}>
      <ActionFeedback action={action} />
      <div className="sims-photo-current">
        {current.status === 'loading' && <p role="status" className="sims-photo-note">Loading the current photo…</p>}
        {current.status === 'failed' && <p role="alert" className="sims-feedback">Could not load the current photo.</p>}
        {current.status === 'ready' && (current.url
          ? <img src={current.url} width={160} height={160} alt={`Current photo of ${fullName(student)}`} />
          : <p className="sims-photo-note">No photo yet.</p>)}
      </div>
      <PhotoCropper onReady={setPhoto} disabled={action.busy} />
      <div className="sims-dialog-actions">
        <Btn disabled={!photo} loading={action.busy} onClick={save}>Save photo</Btn>
      </div>
    </Modal>
  );
}
