import { useState } from 'react';
import S from '../../strings.js';
import { Banner } from '../../components/ui.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { SettingsGroup, SettingsRow, SwitchRow } from '../../components/SettingsList.jsx';
import { enableOnThisDevice, disableOnThisDevice } from '../../lib/notifications.js';
import { setGuardianPrefs } from '../../lib/guardianWrites.js';

const STATE_TEXT = { on: S.notifOn, off: S.notifOff, blocked: S.notifBlocked, unsupported: S.notifUnsupported, ios_needs_install: S.notifIosInstall, account_off: S.notifOff };

export default function NotificationsPage({ ctx, back }) {
  const { user, navigate, device, accountEnabled, announcementPush, state } = ctx;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const setPref = (fields) => setGuardianPrefs(user.uid, fields).catch(() => setErr(S.reportFailed));
  const enable = async () => { setBusy(true); setErr(null); try { await enableOnThisDevice(user.uid); } catch { setErr(S.notifBlockedHelp); } device.refresh(); setBusy(false); };
  const disable = async () => { setBusy(true); await disableOnThisDevice(user.uid); device.refresh(); setBusy(false); };
  return (
    <>
      <PageHeader title={S.settingsNotifications} onBack={back} />
      {err && <Banner tone="danger">{err}</Banner>}
      <SettingsGroup footer={S.pushDisclaimer}>
        <SwitchRow label={S.notifRowScans} checked={accountEnabled} onChange={(on) => setPref({ notificationsEnabled: on })} />
        <SwitchRow label={S.notifRowAnnouncements} checked={accountEnabled && announcementPush} disabled={!accountEnabled} onChange={(on) => setPref({ announcementPushEnabled: on })} />
      </SettingsGroup>
      <SettingsGroup header={S.settingsThisDevice} footer={state === 'blocked' ? S.notifBlockedHelp : undefined}>
        <SettingsRow label={STATE_TEXT[state]} />
        {state === 'ios_needs_install' && <SettingsRow label={S.notifHowToInstall} tone="primary" onClick={() => navigate('/settings/install')} />}
        {state === 'off' && <SettingsRow label={S.notifTurnOn} tone="primary" chevron={false} disabled={busy} onClick={enable} />}
        {state === 'on' && <SettingsRow label={S.notifTurnOff} tone="primary" chevron={false} disabled={busy} onClick={disable} />}
      </SettingsGroup>
    </>
  );
}
