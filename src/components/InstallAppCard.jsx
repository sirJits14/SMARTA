import { useInstallApp } from '../hooks/useInstallApp.js';
import { T, S } from '../styles.js';
import { Btn, Card } from './ui.jsx';

// Settings card: install SIMS as an app, or how to on browsers without a prompt.
const INSTALL_HINT = {
  installed: 'SIMS is installed on this device.',
  available: 'Install SIMS on this computer or phone. It opens in its own window and starts even when the internet is down.',
  dismissed: 'Installation was cancelled. To try again, reload the page or choose Install from the browser menu.',
  ios: 'On iPhone or iPad, open SIMS in Safari, tap Share, then Add to Home Screen.',
  unavailable: "This browser isn't offering installation right now. In Chrome or Edge, choose Install from the browser menu. If SIMS is already installed, open it from your apps.",
};

export default function InstallAppCard() {
  const { status, install } = useInstallApp();
  return (
    <Card style={{ padding: 24, maxWidth: 560, marginTop: 16 }}>
      <h2 style={S.h2}>Install app</h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <p role="status" style={{ margin: 0, flex: '1 1 260px', fontFamily: T.body, fontSize: 14, lineHeight: 1.5, color: status === 'installed' ? T.present : T.inkMuted, fontWeight: status === 'installed' ? 600 : 400 }}>
          {INSTALL_HINT[status]}
        </p>
        {status === 'available' && <Btn onClick={install}>Install app</Btn>}
      </div>
    </Card>
  );
}
