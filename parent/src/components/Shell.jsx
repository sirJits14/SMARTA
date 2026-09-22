import { useEffect, useState } from 'react';
import S from '../strings.js';
import { T } from '../styles.js';
import { Banner } from './ui.jsx';
import { useDoc } from '../hooks/useDoc.js';

const NAV = [['/', S.navHome], ['/inbox', S.navInbox], ['/settings', S.navSettings]];

export default function Shell({ route, navigate, children }) {
  const portal = useDoc('settings/parent_portal').data;
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return (
    <div style={{ fontFamily: T.font, color: T.ink, background: T.bg, minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '14px 16px 0', maxWidth: 560, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10 }}>{S.appName}</div>
        {!online && <Banner tone="warn">{S.offlineBanner}</Banner>}
        {portal?.notificationsPaused && <Banner tone="warn">{S.pausedBanner}{portal.pauseNote ? `: ${portal.pauseNote}` : ''}</Banner>}
        {portal?.announcement && <Banner>{portal.announcement}</Banner>}
      </header>
      <main style={{ flex: 1, padding: '0 16px 88px', maxWidth: 560, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>{children}</main>
      <nav aria-label="Main" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: T.surface, borderTop: `1px solid ${T.border}`, display: 'flex', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {NAV.map(([path, label]) => {
          const active = (path === '/' ? route.name === 'home' || route.name === 'learner' : route.name === (path === '/inbox' ? 'inbox' : 'settings'));
          return <button key={path} onClick={() => navigate(path)} aria-current={active ? 'page' : undefined} style={{ flex: 1, minHeight: 56, border: 'none', background: 'transparent', fontFamily: T.font, fontSize: 14, fontWeight: active ? 700 : 500, color: active ? T.primary : T.inkMuted, cursor: 'pointer' }}>{label}</button>;
        })}
      </nav>
    </div>
  );
}
