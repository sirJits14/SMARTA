import S from '../../strings.js';
import PageHeader from '../../components/PageHeader.jsx';
import { SettingsGroup, SettingsRow } from '../../components/SettingsList.jsx';

const statusText = (r) => [r.status === 'open' ? S.requestOpen : S.reportReviewed, r.resolutionNote].filter(Boolean).join(': ');

export default function ReportsPage({ ctx, back }) {
  const { reports, navigate } = ctx;
  return (
    <>
      <PageHeader title={S.settingsReportsRequests} onBack={back} />
      {reports && (
        <SettingsGroup header={S.settingsReports}>
          {reports.length === 0 && <SettingsRow label={S.settingsReportsEmpty} />}
          {reports.map((r) => <SettingsRow key={r.id} label={r.reason} subtitle={statusText(r)} />)}
        </SettingsGroup>
      )}
      <SettingsGroup>
        <SettingsRow label={S.settingsRequests} tone="primary" onClick={() => navigate('/request-access')} />
      </SettingsGroup>
    </>
  );
}
