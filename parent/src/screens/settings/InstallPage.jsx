import { useSyncExternalStore } from 'react';
import S from '../../strings.js';
import PageHeader from '../../components/PageHeader.jsx';
import { SettingsGroup, SettingsRow } from '../../components/SettingsList.jsx';
import { installPrompt } from '../../lib/installPrompt.js';
import { isIOS, isStandalone } from '../../lib/device.js';

// Chrome/Android: a real Install button (the browser's own prompt).
// iPhone: Safari's Share > Add to Home Screen steps. Others: a menu hint.
export default function InstallPage({ back }) {
  const prompt = installPrompt();
  const state = useSyncExternalStore(prompt.subscribe, prompt.state);
  const ios = isIOS();
  return (
    <>
      <PageHeader title={S.settingsInstall} onBack={back} />
      {state === 'installed' || isStandalone() ? (
        <SettingsGroup><SettingsRow tile="green" icon="check" label={S.installDone} /></SettingsGroup>
      ) : (
        <>
          <p className="settings-intro">{S.installBody}</p>
          {state === 'ready' && (
            <SettingsGroup><SettingsRow tile="blue" icon="download" label={S.installButton} tone="primary" chevron={false} onClick={() => prompt.prompt().catch(() => {})} /></SettingsGroup>
          )}
          {state !== 'ready' && ios && (
            <SettingsGroup header={S.installIosHeader}>
              <SettingsRow tile="blue" icon="share" label={S.installIosStep1} />
              <SettingsRow tile="grey" icon="plusSquare" label={S.installIosStep2} />
              <SettingsRow tile="teal" icon="home" label={S.installIosStep3} />
            </SettingsGroup>
          )}
          {state !== 'ready' && !ios && <SettingsGroup><SettingsRow label={S.installOther} /></SettingsGroup>}
        </>
      )}
    </>
  );
}
