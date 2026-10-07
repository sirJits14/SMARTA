import S from '../../strings.js';
import PageHeader from '../../components/PageHeader.jsx';
import { SettingsGroup, SettingsRow } from '../../components/SettingsList.jsx';
import { initials } from '../../lib/format.js';

export default function LearnersPage({ ctx, back }) {
  const { links, navigate } = ctx;
  return (
    <>
      <PageHeader title={S.settingsMyLearners} onBack={back} />
      <SettingsGroup footer={S.settingsRemoveHint}>
        {links?.length === 0 && <SettingsRow label={S.settingsLearnersEmpty} />}
        {(links || []).map((l) => (
          <SettingsRow key={l.id} leading={<span className="settings-avatar settings-avatar--small" aria-hidden="true">{initials(l.learnerName || l.relationship)}</span>}
            label={l.learnerName || l.relationship} subtitle={l.learnerName ? l.relationship : undefined} onClick={() => navigate(`/learner/${l.studentId}`)} />
        ))}
        <SettingsRow label={S.activateAnother} tone="primary" onClick={() => navigate('/activate')} />
      </SettingsGroup>
    </>
  );
}
