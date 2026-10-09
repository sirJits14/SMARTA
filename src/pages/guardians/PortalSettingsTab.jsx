import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { ActionFeedback } from '../../components/ui.jsx';
import { ResourceState } from '../../components/ui.jsx';
import { useEffect, useRef, useState } from 'react';
import { useDocResource } from '../../hooks/useCollection.js';
import { updatePortalSettings } from '../../data/guardians.js';
import { cleanContact, contactError } from './portalContact.js';
import { T, S } from '../../styles.js';
import { Btn, Inp, Field, Card } from '../../components/ui.jsx';

export default function PortalSettingsTab({ me }) {
  const action = useAsyncAction();
  const portalResource = useDocResource('settings/parent_portal');
  const portal = portalResource.data;
  const [note, setNote] = useState(''); const [announcement, setAnnouncement] = useState(''); const [url, setUrl] = useState(''); const [consentVersion, setConsentVersion] = useState(1);
  const [contact, setContact] = useState(() => cleanContact({}));
  const initialized = useRef(false);
  useEffect(() => { if (!portalResource.loading && !portalResource.error && !initialized.current) { initialized.current = true; setAnnouncement(portal?.announcement || ''); setUrl(portal?.privacyNoticeUrl || ''); setConsentVersion(portal?.consentVersion ?? 1); setContact(cleanContact(portal)); } }, [portal, portalResource.loading, portalResource.error]);
  const paused = portal?.notificationsPaused === true;
  const contactClean = cleanContact(contact);
  const contactProblem = contactError(contactClean);
  const editContact = (key) => (e) => setContact((c) => ({ ...c, [key]: e.target.value }));

  const togglePause = () => updatePortalSettings(paused
    ? { notificationsPaused: false, pauseNote: '', pausedBy: me.email }
    : { notificationsPaused: true, pauseNote: note.trim(), pausedBy: me.email, pausedAt: new Date() }, me);

  if ([portalResource].some(r => r.loading || r.error)) return <ResourceState resources={[portalResource]}/>;

  return (
    <>
      <ActionFeedback action={action}/>
      <Card style={{ padding: 20, marginBottom: 16, borderColor: paused ? T.absent : T.border }}>
        <h2 style={S.h2}>Emergency switch — parent notifications</h2>
        <p style={{ fontFamily: T.body, fontSize: 13, color: T.inkMuted }}>
          {paused ? `PAUSED since ${portal.pausedAt?.toDate?.().toLocaleString() || '—'} by ${portal.pausedBy || '—'}: "${portal.pauseNote}". Gate scans are still recorded and appear in parents' inboxes; pushes are not sent.` : 'Notifications are being sent. Pausing stops pushes within 30 seconds; scans and inbox items continue.'}
        </p>
        {!paused && <Field label="Reason (shown to parents)"><Inp value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Kiosk maintenance today" /></Field>}
        <Btn onClick={() => action.run('pause', togglePause)} disabled={action.busy || (!paused && !note.trim())} style={{ background: paused ? T.primary : T.absent }}>{paused ? 'Resume notifications' : 'Pause notifications'}</Btn>
      </Card>
      <Card style={{ padding: 20 }}>
        <h2 style={S.h2}>Portal banner and privacy notice</h2>
        <Field label="Announcement shown to all parents (blank = none)"><Inp value={announcement} onChange={(e) => setAnnouncement(e.target.value)} /></Field>
        <Field label="Privacy notice URL"><Inp value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
        <Field label="Consent version (raise it to require every parent to re-accept)"><Inp type="number" value={consentVersion} onChange={(e) => setConsentVersion(Number(e.target.value))} style={{ width: 120 }} /></Field>
        <Btn disabled={action.busy} onClick={() => action.run('save', () => updatePortalSettings({ announcement: announcement.trim(), privacyNoticeUrl: url.trim(), consentVersion }, me))}>Save</Btn>
      </Card>
      <Card style={{ padding: 20, marginTop: 16 }}>
        <h2 style={S.h2}>School contact details (shown in the Parents App)</h2>
        <p style={{ fontFamily: T.body, fontSize: 13, color: T.inkMuted }}>Parents see these under Settings → Help &amp; Contact School. Leave a field blank to hide it.</p>
        <Field label="Phone"><Inp value={contact.contactPhone} onChange={editContact('contactPhone')} placeholder="e.g. (044) 123 4567" /></Field>
        <Field label="Email"><Inp type="email" value={contact.contactEmail} onChange={editContact('contactEmail')} placeholder="e.g. registrar@school.edu.ph" /></Field>
        <Field label="Facebook page link"><Inp value={contact.contactFacebookUrl} onChange={editContact('contactFacebookUrl')} placeholder="https://www.facebook.com/…" /></Field>
        <Field label="Office hours"><Inp value={contact.officeHours} onChange={editContact('officeHours')} placeholder="e.g. Mon–Fri, 7:30 AM – 4:30 PM" /></Field>
        {contactProblem && <p role="alert" style={{ fontFamily: T.body, fontSize: 13, color: T.absent }}>{contactProblem}</p>}
        <Btn disabled={action.busy || Boolean(contactProblem)} onClick={() => action.run('saveContact', () => updatePortalSettings(contactClean, me))}>Save contact details</Btn>
      </Card>
    </>
  );
}
