import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import S from '../strings.js';
import { T } from '../styles.js';
import { Banner } from './ui.jsx';
import Icon from './Icon.jsx';
import { useDoc } from '../hooks/useDoc.js';
import { NAV_TABS, activeTab } from '../lib/nav.js';

const LABEL = { home: S.navHome, inbox: S.navInbox, settings: S.navSettings };

// Frosted floating pill. One chip slides behind the active tab; its target is
// measured from the active button after layout (the layout itself switches
// instantly, only the chip and label animate).
function GlassNav({ route, navigate }) {
  const active = activeTab(route.name);
  const navRef = useRef(null);
  const btnRefs = useRef({});
  const [chip, setChip] = useState(null); // { x, w } or null when no tab is lit
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const activeEl = active && btnRefs.current[active];
    const measure = () => {
      const el = active && btnRefs.current[active];
      setChip((prev) => {
        if (!el) return null;
        const x = el.offsetLeft, w = el.offsetWidth;
        return prev && prev.x === x && prev.w === w ? prev : { x, w };
      });
    };
    measure();
    const ro = new ResizeObserver(measure); // rotation, font scaling, text-only zoom
    ro.observe(navRef.current);
    if (activeEl) ro.observe(activeEl);
    return () => ro.disconnect();
  }, [active]);

  // Turn transitions on only after the first placement so the chip doesn't
  // fly in from the left edge on page load.
  useEffect(() => {
    if (!chip || animate) return;
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, [chip, animate]);

  return (
    <nav ref={navRef} aria-label="Main" className="gnav">
      {chip && <span aria-hidden="true" className={`gnav-chip${animate ? ' gnav-chip--anim' : ''}`} style={{ width: chip.w, transform: `translateX(${chip.x}px)` }} />}
      {NAV_TABS.map(({ key, path }) => {
        const on = key === active;
        return (
          <button key={key} ref={(el) => { btnRefs.current[key] = el; }} type="button" className="gnav-btn"
            onClick={() => navigate(path)} aria-current={on ? 'page' : undefined}>
            <Icon name={key} filled={on} size={22} />
            <span className="gnav-label">{LABEL[key]}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default function Shell({ route, navigate, children }) {
  const portal = useDoc('settings/parent_portal').data;
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return (
    <div style={{ fontFamily: T.font, color: T.ink, minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '14px 16px 0', maxWidth: 560, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10 }}>{S.appName}</div>
        {!online && <Banner tone="warn">{S.offlineBanner}</Banner>}
        {portal?.notificationsPaused && <Banner tone="warn">{S.pausedBanner}{portal.pauseNote ? `: ${portal.pauseNote}` : ''}</Banner>}
        {portal?.announcement && <Banner>{portal.announcement}</Banner>}
      </header>
      <main style={{ flex: 1, padding: '0 16px calc(96px + env(safe-area-inset-bottom))', maxWidth: 560, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>{children}</main>
      <GlassNav route={route} navigate={navigate} />
    </div>
  );
}
