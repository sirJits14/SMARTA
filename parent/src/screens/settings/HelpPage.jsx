import S from '../../strings.js';
import PageHeader from '../../components/PageHeader.jsx';
import { SettingsGroup, SettingsRow } from '../../components/SettingsList.jsx';
import { contactRows } from '../../lib/settingsSections.js';

// Contact details staff set in SIMS > Guardians > Portal Settings.
export default function HelpPage({ ctx, back }) {
  const rows = contactRows(ctx.portal);
  return (
    <>
      <PageHeader title={S.settingsHelp} onBack={back} />
      {rows.length === 0 ? <p className="settings-intro">{S.helpEmpty}</p> : (
        <SettingsGroup>
          {rows.map((r) => <SettingsRow key={r.key} tile={r.tile} icon={r.icon} label={r.label} subtitle={r.value} href={r.href} external={r.external} />)}
        </SettingsGroup>
      )}
    </>
  );
}
