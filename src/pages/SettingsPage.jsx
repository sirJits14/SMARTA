import { useAsyncAction } from '../hooks/useAsyncAction.js';
import { ActionFeedback } from '../components/ui.jsx';
import { ResourceState } from '../components/ui.jsx';
import { useEffect, useRef, useState } from 'react';
import { useDocResource } from '../hooks/useCollection.js';
import InstallAppCard from '../components/InstallAppCard.jsx';
import { updateSettings, PICKUP_PLACE_MAX } from '../data/settings.js';
import { T, S } from '../styles.js';
import { Btn, Inp, Field, Card } from '../components/ui.jsx';

export default function SettingsPage() {
  const action = useAsyncAction();
  const settingsResource = useDocResource('settings/app');
  const settings = settingsResource.data;
  const [f, setF] = useState({ schoolId: '', schoolName: '', principalName: '', principalTitle: '', passPickupPlace: '' });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const initedRef = useRef(false);

  // Sync from Firestore into local edit state exactly once, the first time
  // a real snapshot arrives -- settings/app may hold other fields (e.g.
  // currentSchoolYear) this page doesn't touch, and useDoc gives no signal
  // to distinguish "still loading" from "doc has no schoolId/schoolName
  // yet", so a plain useState(settings) initializer would either miss the
  // real values (if they arrive after mount) or, if re-run on every
  // snapshot, silently discard whatever the registrar is mid-typing.
  useEffect(() => {
    if (!settingsResource.loading && !settingsResource.error && !initedRef.current) {
      setF({ schoolId: settings?.schoolId || '', schoolName: settings?.schoolName || '',
        principalName: settings?.principalName || '', principalTitle: settings?.principalTitle || '',
        passPickupPlace: settings?.passPickupPlace || '' });
      initedRef.current = true;
    }
  }, [settings, settingsResource.loading, settingsResource.error]);

  const set = (k, v) => { setF((p) => ({ ...p, [k]: v })); setSaved(false); };

  const save = () => action.run('save', async () => {
    setSaving(true);
    try {
      await updateSettings(f);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  });

  if ([settingsResource].some(r => r.loading || r.error)) return <ResourceState resources={[settingsResource]}/>;

  return (
    <div>
      <div className="sims-heading" style={S.plate}>
        <h1 style={S.h1}>Settings</h1>
      </div>
      <Card style={{ padding: 24, maxWidth: 560 }}>
        <ActionFeedback action={action}/>
        <Field label="School ID"><Inp value={f.schoolId} onChange={(e) => set('schoolId', e.target.value)} /></Field>
        <Field label="Name of School"><Inp value={f.schoolName} onChange={(e) => set('schoolName', e.target.value)} /></Field>
        <Field label="Principal's name"><Inp value={f.principalName} placeholder="PAUL O. ORONG" aria-describedby="settings-principal-hint" onChange={(e) => set('principalName', e.target.value)} /></Field>
        <Field label="Principal's title"><Inp value={f.principalTitle} placeholder="Secondary Principal IV" aria-describedby="settings-principal-hint" onChange={(e) => set('principalTitle', e.target.value)} /></Field>
        <p id="settings-principal-hint" style={{ margin: '-4px 0 8px', fontFamily: T.body, fontSize: 12, color: T.inkMuted }}>Printed on temporary ID passes.</p>
        <Field label="Pass pick-up place"><Inp value={f.passPickupPlace} maxLength={PICKUP_PLACE_MAX} placeholder="Logistics Office, Admin Building" aria-describedby="settings-pickup-hint" onChange={(e) => set('passPickupPlace', e.target.value)} /></Field>
        <p id="settings-pickup-hint" style={{ margin: '-4px 0 8px', fontFamily: T.body, fontSize: 12, color: T.inkMuted }}>Shown to advisers when their requested passes are ready.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
          {saved && <span style={{ fontFamily: T.body, fontSize: 'var(--sims-field-font, 13px)', color: T.present, fontWeight: 600 }}>Saved ✓</span>}
          <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
        </div>
      </Card>
      <InstallAppCard/>
    </div>
  );
}
