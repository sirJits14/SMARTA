import { useState } from 'react';
import S from '../../strings.js';
import { Btn, Card, Banner, Field, Inp } from '../../components/ui.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { SettingsGroup, SettingsRow } from '../../components/SettingsList.jsx';
import { saveDisplayName } from '../../lib/guardianWrites.js';

export default function ProfilePage({ ctx, back }) {
  const { user, profile, savedName } = ctx;
  const [name, setName] = useState(savedName);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const save = async () => {
    setBusy(true); setErr(null); setSaved(false);
    try { await saveDisplayName(user, name.trim()); setSaved(true); } catch { setErr(S.reportFailed); }
    setBusy(false);
  };
  return (
    <>
      <PageHeader title={S.settingsProfile} avatarName={savedName || user.email} onBack={back} />
      {err && <Banner tone="danger">{err}</Banner>}
      <SettingsGroup>
        <SettingsRow label={S.signedInAs} subtitle={user.email} />
      </SettingsGroup>
      {profile && (
        <Card>
          <Field label={S.yourName} hint={S.yourNameHint}>
            <Inp autoComplete="name" autoCapitalize="words" maxLength={120} value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} />
          </Field>
          {saved && <Banner>{S.settingsNameSaved}</Banner>}
          <Btn variant="ghost" onClick={save} disabled={busy || name.trim().length < 2 || name.trim() === savedName}>{S.settingsNameSave}</Btn>
        </Card>
      )}
    </>
  );
}
