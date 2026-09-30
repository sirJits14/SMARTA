import { useEffect, useState } from 'react';
import { collection, query, where, getCountFromServer } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { call } from '../../data/guardians.js';
import { previousSchoolYear } from '../../lib/dates.js';
import { T, S } from '../../styles.js';
import { Btn, Card, Field, Inp, Sel, Modal } from '../../components/ui.jsx';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

async function countOpen(sy) {
  const [slips, links] = await Promise.all([
    getCountFromServer(query(collection(db, 'activation_codes'), where('schoolYear', '==', sy), where('status', 'in', ['issued', 'exhausted']))),
    getCountFromServer(query(collection(db, 'guardian_links'), where('schoolYear', '==', sy), where('status', '==', 'active'))),
  ]);
  return { slips: slips.data().count, links: links.data().count };
}

// Slips and links no longer end on their own (spec 2026-09-30 §3); this is
// the only way a school year's parent-portal access ends.
export default function EndSchoolYearCard({ schoolYear }) {
  const previous = previousSchoolYear(schoolYear);
  const [sy, setSy] = useState(schoolYear);
  const [counts, setCounts] = useState({});
  const [loadErr, setLoadErr] = useState(false);
  const [reload, setReload] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [done, setDone] = useState(null);

  useEffect(() => {
    let on = true; setLoadErr(false);
    Promise.all([countOpen(schoolYear), countOpen(previous)])
      .then(([cur, prev]) => { if (on) setCounts({ [schoolYear]: cur, [previous]: prev }); })
      .catch(() => { if (on) setLoadErr(true); });
    return () => { on = false; };
  }, [schoolYear, previous, reload]);

  const end = async () => {
    setBusy(true); setErr('');
    try {
      setDone(await call.endSchoolYear({ schoolYear: sy, confirmText: typed.trim() }));
      setConfirming(false); setReload((n) => n + 1);
    } catch (e) { setErr(e.message || 'Could not end the school year.'); }
    setBusy(false);
  };

  const open = counts[sy];
  const prevOpen = counts[previous];
  return (
    <Card className="codes-tab-controls" style={{ padding: 20, marginBottom: 16 }}>
      {prevOpen && prevOpen.slips + prevOpen.links > 0 && (
        <div role="status" style={{ fontFamily: T.body, fontSize: 13, color: T.late, background: 'rgba(180,83,9,0.08)', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
          SY {previous} is still open in the parent portal ({plural(prevOpen.slips, 'slip')}, {plural(prevOpen.links, 'linked account')}) — end it when you are ready.
        </div>
      )}
      <h2 style={S.h2}>End school year</h2>
      <p style={{ fontFamily: T.body, fontSize: 13, color: T.inkMuted }}>
        Revokes every activation slip for the school year and ends every guardian and adviser link. Each linked account gets an inbox message asking them to use the new slip. Do this at the end of the school year, before issuing next year's slips. It cannot be undone.
      </p>
      <Field label="School year">
        <Sel value={sy} disabled={busy} onChange={(e) => { setSy(e.target.value); setDone(null); }}>
          {[schoolYear, previous].map((y) => <option key={y} value={y}>{y}</option>)}
        </Sel>
      </Field>
      <p style={{ fontFamily: T.body, fontSize: 13, color: T.ink, margin: '12px 0' }}>
        {loadErr ? 'Could not load the counts.' : open ? `${plural(open.slips, 'active slip')} · ${plural(open.links, 'active link')}` : 'Counting…'}
      </p>
      {done && <p role="status" style={{ fontFamily: T.body, fontSize: 13, color: T.present }}>Done: {plural(done.codesRevoked, 'slip')} revoked, {plural(done.linksExpired, 'link')} ended, {plural(done.accountsNotified, 'account')} notified.</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Btn onClick={() => { setTyped(''); setErr(''); setDone(null); setConfirming(true); }} style={{ background: T.absent }}>End SY {sy}</Btn>
      </div>
      {confirming && (
        <Modal title={`End SY ${sy}?`} onClose={() => { if (!busy) setConfirming(false); }} dismissible={!busy}>
          <p style={{ fontFamily: T.body, fontSize: 14, color: T.ink, lineHeight: 1.6 }}>
            {open ? `${plural(open.slips, 'slip')} will stop working and ${plural(open.links, 'link')} will end. ` : ''}Type <strong>{sy}</strong> to confirm.
          </p>
          <Field label={`Type ${sy} to confirm`}><Inp value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus placeholder={sy} /></Field>
          {err && <p role="alert" className="sims-feedback">{err}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <Btn variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Btn>
            <Btn disabled={busy || typed.trim() !== sy} onClick={end} style={{ background: T.absent }}>{busy ? 'Ending…' : `End SY ${sy}`}</Btn>
          </div>
        </Modal>
      )}
    </Card>
  );
}
