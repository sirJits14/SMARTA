import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
// Imported here, not only in Settings, so it hears the browser's one install offer at load.
import './hooks/useInstallApp.js';
import '../shared/theme/theme.css';
import './registrar.css';

// A lazy-loaded chunk (App.jsx's/GuardiansPage.jsx's React.lazy() page and
// tab imports) can go missing after a redeploy if this tab was left open --
// the old hashed filename it's requesting no longer exists on the server,
// and firebase.json's SPA rewrite serves back index.html instead of a JS
// module, which the browser correctly refuses to execute. Vite fires this
// event specifically for that case; reload once to pick up the new build.
// Guarded so a genuinely broken chunk (not just staleness) can't reload-loop.
window.addEventListener('vite:preloadError', () => {
  try {
    const last = Number(sessionStorage.getItem('chunkReloadAt') || 0);
    if (Date.now() - last < 10000) return;
    sessionStorage.setItem('chunkReloadAt', String(Date.now()));
  } catch { /* sessionStorage unavailable (private mode, etc.) -- reload anyway below */ }
  window.location.reload();
});

// public/sw.js makes the app installable and lets it open offline. Production only:
// in dev it would serve cached files over Vite's live ones.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}

createRoot(document.getElementById('root')).render(<StrictMode><App/></StrictMode>);
