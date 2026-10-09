import { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../shared/theme/theme.css';
import '../../src/glass.css';
import Settings from '../../src/screens/Settings.jsx';
import { matchRoute } from '../../src/lib/router.js';
import { installPrompt } from '../../src/lib/installPrompt.js';
import { SCENARIOS, setScenario, useProfile, useWrites } from './settings-fixture.js';

installPrompt();
const user = { uid: 'preview-parent', email: 'ana.santos@example.test', displayName: 'Ana Santos' };

// Simulates Chrome's beforeinstallprompt so the Install button can be checked.
function fireInstallPrompt() {
  const e = new Event('beforeinstallprompt', { cancelable: true });
  e.prompt = async () => {};
  e.userChoice = Promise.resolve({ outcome: 'accepted' });
  window.dispatchEvent(e);
}

function Preview() {
  const [path, setPath] = useState('/settings');
  const navigate = useCallback((to) => { setPath(to); window.scrollTo(0, 0); }, []);
  const profile = useProfile();
  const writes = useWrites();
  const route = matchRoute(path);
  return (
    <main style={{ padding: '0 16px 96px', maxWidth: 560, margin: '0 auto', boxSizing: 'border-box' }}>
      <details style={{ margin: '12px 0', fontSize: 12 }}>
        <summary>Preview controls · synthetic data · {path}</summary>
        <select aria-label="Preview scenario" onChange={(e) => setScenario(e.target.value)}>{SCENARIOS.map((s) => <option key={s}>{s}</option>)}</select>{' '}
        <button type="button" onClick={fireInstallPrompt}>Fire install prompt</button>
        <pre data-testid="writes">{writes.map((w) => JSON.stringify(w)).join('\n')}</pre>
      </details>
      {route.name === 'settings'
        ? <Settings user={user} profile={profile} route={route} navigate={navigate} />
        : <p>Left Settings for {path}. <button type="button" onClick={() => navigate('/settings')}>Back to Settings</button></p>}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Preview />);
