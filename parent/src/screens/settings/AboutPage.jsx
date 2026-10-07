import S from '../../strings.js';
import PageHeader from '../../components/PageHeader.jsx';
import { SettingsGroup, SettingsRow } from '../../components/SettingsList.jsx';
import { versionLabel } from '../../lib/buildInfo.js';

export default function AboutPage({ back }) {
  return (
    <>
      <PageHeader title={S.settingsAbout} onBack={back} />
      <SettingsGroup>
        <SettingsRow label={S.appName} subtitle={S.tagline} />
        <SettingsRow label={S.aboutVersion} value={versionLabel()} />
      </SettingsGroup>
    </>
  );
}
