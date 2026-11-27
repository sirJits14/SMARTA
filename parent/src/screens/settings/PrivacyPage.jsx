import { useState } from 'react';
import S from '../../strings.js';
import { Btn, Card, Banner } from '../../components/ui.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { SettingsGroup, SettingsRow } from '../../components/SettingsList.jsx';
import { deleteMyAccount } from '../../lib/guardianWrites.js';

export default function PrivacyPage({ ctx, back }) {
  const url = ctx.portal?.privacyNoticeUrl;
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const remove = async () => { setBusy(true); setErr(null); try { await deleteMyAccount(); } catch { setErr(S.reportFailed); setBusy(false); } };
  return (
    <>
      <PageHeader title={S.settingsPrivacyAccount} onBack={back} />
      {err && <Banner tone="danger">{err}</Banner>}
      <SettingsGroup>
        {url && <SettingsRow label={S.settingsPrivacy} href={url} external />}
        <SettingsRow label={S.settingsDelete} tone="danger" chevron={false} disabled={confirm} onClick={() => setConfirm(true)} />
      </SettingsGroup>
      {confirm && (
        <Card>
          <p style={{ marginTop: 0 }}>{S.settingsDeleteConfirm}</p>
          <div style={{ display: 'grid', gap: 10 }}>
            <Btn variant="danger" onClick={remove} disabled={busy}>{S.settingsDeleteButton}</Btn>
            <Btn variant="ghost" onClick={() => setConfirm(false)} disabled={busy}>{S.cancel}</Btn>
          </div>
        </Card>
      )}
    </>
  );
}
