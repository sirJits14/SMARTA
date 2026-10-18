import S from '../../strings.js';
import PageHeader from '../../components/PageHeader.jsx';
import { SettingsGroup, SettingsRow } from '../../components/SettingsList.jsx';

// Family is the default; School appears in Settings only for assigned staff.
export default function SchoolModePage({ ctx, back }) {
  const { mode, chooseMode } = ctx;
  return (
    <>
      <PageHeader title={S.modeTitle} onBack={back} />
      <SettingsGroup footer={S.modeSavedHere}>
        <SettingsRow tile="green" icon="people" label={S.modeFamily} subtitle={S.modeFamilyHint}
          value={mode.view === 'family' ? S.modeInUse : undefined} chevron={false} onClick={() => chooseMode('family')} />
        <SettingsRow tile="teal" icon="class" label={S.modeSchool} subtitle={S.modeSchoolHint}
          value={mode.view === 'school' ? S.modeInUse : undefined} chevron={false} onClick={() => chooseMode('school')} />
      </SettingsGroup>
    </>
  );
}
