import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { doc, updateDoc, collection, query, where, limit } from 'firebase/firestore';
import { auth, db, callable } from '../firebase.js';
import S from '../strings.js';
import { T } from '../styles.js';
import { Btn, Card, Banner } from '../components/ui.jsx';
import { useLinks } from '../hooks/useLinks.js';
import { useQuery, useDoc } from '../hooks/useDoc.js';
import { notificationState } from '../lib/notificationState.js';
import { useDeviceStatus, enableOnThisDevice, disableOnThisDevice } from '../lib/notifications.js';

const STATE_TEXT = { on: S.notifOn, off: S.notifOff, blocked: S.notifBlocked, unsupported: S.notifUnsupported, ios_needs_install: S.notifIosInstall, account_off: S.notifOff };

export default function Settings({ user, profile, navigate }) {
  const { links } = useLinks(user.uid);
  const device = useDeviceStatus(user.uid);
  const portal = useDoc('settings/parent_portal').data;
  const { rows: reports } = useQuery(() => query(collection(db, 'reports'), where('guardianUid', '==', user.uid), limit(10)), [user.uid]);
  const accountEnabled = profile?.notificationsEnabled !== false;
  const state = notificationState({ ...device, accountEnabled });
  const [busy, setBusy] = useState(false); const [confirmDelete, setConfirmDelete] = useState(false); const [err, setErr] = useState(null);

  const toggleAccount = () => updateDoc(doc(db, 'guardians', user.uid), { notificationsEnabled: !accountEnabled }).catch(() => setErr(S.reportFailed));
  const enable = async () => { setBusy(true); setErr(null); try { await enableOnThisDevice(user.uid); } catch { setErr(S.notifBlockedHelp); } device.refresh(); setBusy(false); };
  const disable = async () => { setBusy(true); await disableOnThisDevice(user.uid); device.refresh(); setBusy(false); };
  const remove = async () => { setBusy(true); try { await callable('deleteGuardianAccountFn')({}); await signOut(auth); } catch { setErr(S.reportFailed); setBusy(false); } };

  return (
    <>
      <h1 style={{ fontSize: 20 }}>{S.settingsTitle}</h1>
      {err && <Banner tone="danger">{err}</Banner>}
      <Card>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>{S.settingsNotifications}</h2>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44 }}>
          <input type="checkbox" checked={accountEnabled} onChange={toggleAccount} style={{ width: 22, height: 22 }} />{S.settingsAccountToggle}
        </label>
        <div style={{ fontSize: 13, color: T.inkMuted, marginTop: 8 }}>{S.settingsThisDevice}: {STATE_TEXT[state]}</div>
        {state === 'blocked' && <p style={{ fontSize: 13 }}>{S.notifBlockedHelp}</p>}
        {(state === 'off' || state === 'account_off') && accountEnabled && <Btn onClick={enable} disabled={busy} style={{ marginTop: 8 }}>{S.notifTurnOn}</Btn>}
        {state === 'on' && <Btn variant="ghost" onClick={disable} disabled={busy} style={{ marginTop: 8 }}>{S.notifTurnOff}</Btn>}
        <p style={{ fontSize: 12, color: T.inkMuted }}>{S.pushDisclaimer}</p>
      </Card>
      <Card>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>{S.settingsLearners}</h2>
        {(links || []).map((l) => <div key={l.id} style={{ padding: '6px 0', fontSize: 14 }}>{l.relationship} · <button onClick={() => navigate(`/learner/${l.studentId}`)} style={{ background: 'none', border: 'none', color: T.primary, fontFamily: T.font, fontSize: 14, cursor: 'pointer', padding: 0 }}>{S.homeViewHistory}</button></div>)}
        <Btn variant="ghost" onClick={() => navigate('/activate')} style={{ marginTop: 6 }}>{S.activateAnother}</Btn>
        <p style={{ fontSize: 12, color: T.inkMuted }}>{S.settingsRemoveHint}</p>
      </Card>
      <Card>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>{S.settingsReports}</h2>
        {(reports || []).length === 0 && <div style={{ fontSize: 13, color: T.inkMuted }}>—</div>}
        {(reports || []).map((r) => <div key={r.id} style={{ fontSize: 14, padding: '6px 0' }}>{r.reason} — <strong>{r.status === 'open' ? S.requestOpen : 'Reviewed'}</strong>{r.resolutionNote ? `: ${r.resolutionNote}` : ''}</div>)}
        <Btn variant="ghost" onClick={() => navigate('/request-access')} style={{ marginTop: 6 }}>{S.settingsRequests}</Btn>
      </Card>
      <Card>
        {portal?.privacyNoticeUrl && <p><a href={portal.privacyNoticeUrl} target="_blank" rel="noreferrer">{S.settingsPrivacy}</a></p>}
        {!confirmDelete && <Btn variant="ghost" onClick={() => setConfirmDelete(true)}>{S.settingsDelete}</Btn>}
        {confirmDelete && <><p>{S.settingsDeleteConfirm}</p><div style={{ display: 'grid', gap: 10 }}><Btn variant="danger" onClick={remove} disabled={busy}>{S.settingsDeleteButton}</Btn><Btn variant="ghost" onClick={() => setConfirmDelete(false)}>{S.cancel}</Btn></div></>}
        <Btn variant="ghost" onClick={() => signOut(auth)} style={{ marginTop: 12 }}>{S.signOut}</Btn>
      </Card>
    </>
  );
}
