import { useState } from 'react';
import { announcements } from '../../data/announcements.js';
import { emptyForm, formFromPost, validateForm, pinnedCount, audienceOf, audienceLabel } from '../../lib/announcements.js';
import { TITLE_MAX, BODY_MAX, canPostToAll, postableGrades, postAudienceKeys } from '../../../shared/announcements.js';
import { T } from '../../styles.js';
import { Btn, Inp, Field, Modal, Confirm } from '../../components/ui.jsx';

const hint = { fontFamily: T.body, fontSize: 12, color: T.inkMuted, margin: '-8px 0 14px' };
const row = { display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14, fontFamily: T.body, fontSize: 13 };
const check = { display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer' };

// Create (editing = null) or edit an announcement. A live post's audience,
// push and timing are shown but locked (spec: change them by unpublishing
// and posting again). New posts confirm with a guardian count first.
export default function AnnouncementForm({ me, editing, posts, onClose }) {
  const [f, setF] = useState(() => (editing ? formFromPost(editing) : emptyForm(me)));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // { message } once counted
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const live = editing?.status === 'published';
  const grades = postableGrades(me);
  const lockedGrade = grades.length === 1;
  const toggleGrade = (g) => set('grades', f.grades.includes(g) ? f.grades.filter((x) => x !== g) : [...f.grades, g]);

  const problem = () => validateForm(f, { me, nowMs: Date.now(), pinnedCount: pinnedCount(posts, editing?.id), editing });
  const save = async () => {
    setBusy(true); setErr('');
    try { await (editing ? announcements.update(editing, f, me) : announcements.create(f, me)); onClose(); }
    catch (e) { setErr(e?.code === 'permission-denied' ? 'You can\'t save this announcement. Check its audience and timing.' : 'The announcement could not be saved. Please try again.'); setBusy(false); }
  };
  const submit = async () => {
    const p = problem(); if (p) { setErr(p); return; }
    if (editing) { await save(); return; }
    setBusy(true); setErr('');
    const keys = postAudienceKeys(audienceOf(f));
    let count = null;
    try { count = await announcements.audienceCount(keys); } catch { /* the count is a courtesy; still allow publishing */ }
    setBusy(false);
    const who = count == null ? 'the guardians' : `about ${count.toLocaleString('en-US')} guardian${count === 1 ? '' : 's'}`;
    const verb = f.when === 'now' ? 'This will be visible to' : 'When it goes out, this will be visible to';
    setConfirm({ message: `${verb} ${who} (${audienceLabel(keys)})${f.push ? ' and send them a notification' : ''}.` });
  };

  if (confirm) return (
    <Confirm title={f.when === 'now' ? 'Publish announcement' : 'Schedule announcement'} message={confirm.message}
      label={f.when === 'now' ? 'Publish' : 'Schedule'} danger={false}
      onYes={async () => { await (editing ? announcements.update(editing, f, me) : announcements.create(f, me)); onClose(); }}
      onNo={() => setConfirm(null)} />
  );

  return (
    <Modal title={editing ? 'Edit announcement' : 'New announcement'} onClose={onClose} dismissible={!busy} width={600}>
      {err && <p role="alert" className="sims-feedback">{err}</p>}
      <Field label="Title"><Inp value={f.title} maxLength={TITLE_MAX} onChange={(e) => set('title', e.target.value)} /></Field>
      <Field label="Message">
        <textarea className="sims-input" value={f.body} maxLength={BODY_MAX} rows={8} onChange={(e) => set('body', e.target.value)}
          style={{ fontFamily: T.body, fontSize: 13, width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${T.border}`, resize: 'vertical' }} />
      </Field>
      <p style={hint}>{f.body.length.toLocaleString('en-US')} / {BODY_MAX.toLocaleString('en-US')} · Links are made clickable automatically.</p>

      <fieldset disabled={live} style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontFamily: T.body, fontSize: 12, fontWeight: 600, color: T.inkMuted, marginBottom: 6 }}>Audience</legend>
        <div style={row}>
          {canPostToAll(me) && <label style={check}><input type="checkbox" checked={f.all} onChange={(e) => set('all', e.target.checked)} /> All parents</label>}
          {!f.all && grades.map((g) => (
            <label key={g} style={check}><input type="checkbox" checked={f.grades.includes(g)} disabled={lockedGrade} onChange={() => toggleGrade(g)} /> Grade {g}</label>
          ))}
        </div>
        <div style={{ fontFamily: T.body, fontSize: 12, fontWeight: 600, color: T.inkMuted, marginBottom: 6 }}>When</div>
        <div style={row}>
          <label style={check}><input type="radio" name="when" checked={f.when === 'now'} onChange={() => set('when', 'now')} disabled={!!editing} /> Publish now</label>
          <label style={check}><input type="radio" name="when" checked={f.when === 'schedule'} onChange={() => set('when', 'schedule')} disabled={!!editing} /> Schedule</label>
          {f.when === 'schedule' && <>
            <Inp type="date" aria-label="Publish date" value={f.date} onChange={(e) => set('date', e.target.value)} style={{ width: 160 }} />
            <Inp type="time" aria-label="Publish time" value={f.time} onChange={(e) => set('time', e.target.value)} style={{ width: 120 }} />
          </>}
        </div>
        {f.when === 'schedule' && !live && <p style={hint}>Philippine time. Scheduled posts go out within 5 minutes of the set time.</p>}
        <div style={row}>
          <label style={check}><input type="checkbox" checked={f.push} onChange={(e) => set('push', e.target.checked)} /> Send push notification</label>
        </div>
        <p style={hint}>Use for urgent or time-sensitive notices.</p>
      </fieldset>
      {live && <p style={hint}>The audience, timing and push of a published announcement can't change. Unpublish it and post a new one instead.</p>}

      <div style={row}>
        <label style={check}>Expires on <Inp type="date" value={f.expires} onChange={(e) => set('expires', e.target.value)} style={{ width: 160 }} /></label>
        {f.expires && <Btn variant="ghost" onClick={() => set('expires', '')}>Clear</Btn>}
        <label style={check}><input type="checkbox" checked={f.pinned} onChange={(e) => set('pinned', e.target.checked)} /> Pin to top</label>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <Btn variant="ghost" disabled={busy} onClick={onClose}>Cancel</Btn>
        <Btn disabled={busy} onClick={submit}>{busy ? 'Working…' : editing ? 'Save changes' : f.when === 'now' ? 'Publish…' : 'Schedule…'}</Btn>
      </div>
    </Modal>
  );
}
