import { useAsyncAction } from '../hooks/useAsyncAction.js';
import { ActionFeedback } from '../components/ui.jsx';
import { ResourceState } from '../components/ui.jsx';
import { useEffect, useRef, useState } from 'react';
import { useDocResource } from '../hooks/useCollection.js';
import { updateSettings } from '../data/settings.js';
import { T, S } from '../styles.js';
import { Btn, Inp, Field, Card } from '../components/ui.jsx';

export default function SettingsPage() {
  const action = useAsyncAction();
  const settingsResource = useDocResource('settings/app');
  const settings = settingsResource.data;
  const [f, setF] = useState({ schoolId: '', schoolName: '' });
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
      setF({ schoolId: settings?.schoolId || '', schoolName: settings?.schoolName || '' });
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
          {saved && <span style={{ fontFamily: T.body, fontSize: 'var(--sims-field-font, 13px)', color: T.present, fontWeight: 600 }}>Saved ✓</span>}
          <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
        </div>
      </Card>
    </div>
  );
}
