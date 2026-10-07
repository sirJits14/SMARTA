import S from '../../strings.js';
import PageHeader from '../../components/PageHeader.jsx';
import ThemeControl from '../../components/ThemeControl.jsx';
import { SettingsGroup } from '../../components/SettingsList.jsx';

export default function AppearancePage({ back }) {
  return (
    <>
      <PageHeader title={S.themeTitle} onBack={back} />
      <SettingsGroup footer={S.themeSavedHere}>
        <div style={{ padding: 14 }}><ThemeControl /></div>
      </SettingsGroup>
    </>
  );
}
