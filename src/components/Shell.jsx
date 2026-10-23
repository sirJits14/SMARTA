import { useEffect, useRef, useState } from 'react';
import { CountBadge } from './ui.jsx';
import AccountMenu from './AccountMenu.jsx';
import DialogFrame from './DialogFrame.jsx';
import NavIcon from './NavIcon.jsx';
import { NAV_ITEMS } from '../lib/navigation.js';
import { canOpen, isAdmin } from '../lib/access.js';
import { useSchoolPendingCount } from '../hooks/useSchoolPendingCount.js';
import { useLearnerRequestCount } from '../hooks/useLearnerRequestCount.js';
import smartaWordmark from '../assets/smarta-wordmark-sidebar.png';
import smartaWordmarkDark from '../assets/smarta-wordmark-sidebar-dark.png';
import smartaMark from '../assets/smarta-mark.png';

const STORAGE = 'sims.sidebar.collapsed';
const readPreference = () => { try { const v = localStorage.getItem(STORAGE); return v === 'true' ? true : v === 'false' ? false : null; } catch { return null; } };
export default function Shell({ me, page, setPage, schoolYear, onLogout, children }) {
  const [width, setWidth] = useState(() => window.innerWidth);
  const [preference, setPreference] = useState(readPreference);
  const [drawer, setDrawer] = useState(false);
  const [tooltip, setTooltip] = useState(null);
  const menuRef = useRef(null);
  const mainRef = useRef(null);
  const mobile = width < 768;
  const items = NAV_ITEMS.filter(item => canOpen(me, item.key));
  const pendingSchool = useSchoolPendingCount(isAdmin(me));
  const waitingLearners = useLearnerRequestCount(canOpen(me, 'learnerRequests'));
  // Counts on nav items: pending school access requests (administrators) and learner requests this person can decide.
  const badgeFor = item => item.key === 'guardians' ? { count: pendingSchool, label: 'pending school access requests' }
    : item.key === 'learnerRequests' ? { count: waitingLearners, label: 'learner requests waiting' } : null;
  const navLabel = item => { const badge = badgeFor(item); return badge?.count ? `${item.label}, ${badge.count} ${badge.label}` : item.label; };
  const collapsed = !mobile && (preference ?? width < 1024);
  useEffect(() => {
    const resize = () => { setWidth(window.innerWidth); setTooltip(null); if (window.innerWidth >= 768) setDrawer(false); };
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const toggle = () => { const next = !collapsed; setPreference(next); setTooltip(null); try { localStorage.setItem(STORAGE, String(next)); } catch { /* navigation works without storage */ } };
  const navigate = key => { setPage(key); setDrawer(false); setTooltip(null); };
  // Icon-only controls (the collapsed rail, the collapse toggle) name themselves in a tooltip beside the control.
  const showLabel = (event, label, always) => {
    if (!collapsed && !always) return;
    const box = event.currentTarget.getBoundingClientRect();
    setTooltip({ label, top: box.top + box.height / 2, left: box.right + 10 });
  };
  const hint = (label, always = false) => ({ onMouseEnter: e => showLabel(e, label, always), onMouseLeave: () => setTooltip(null), onFocus: e => showLabel(e, label, always), onBlur: () => setTooltip(null) });
  const pageLabel = NAV_ITEMS.find(item => item.key === page)?.label || 'BNHS SIMS';
  const sidebar = <aside className="app-sidebar">
    <div className="sims-brand">{collapsed
      ? <img src={smartaMark} alt="SMARTA" width="28" height="28" />
      : <><img className="sims-wordmark theme-light-only" src={smartaWordmark} alt="SMARTA" width="188" height="54" />
        <img className="sims-wordmark theme-dark-only" src={smartaWordmarkDark} alt="SMARTA" width="188" height="54" /></>}
      {!mobile && <button type="button" className="sims-btn sims-btn--icon sims-collapse" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!collapsed} onClick={toggle} {...hint(collapsed ? 'Expand sidebar' : 'Collapse sidebar', true)}>
        <NavIcon name="panel" size={18} /></button>}
    </div>
    <nav className="sims-nav" aria-label="Main navigation">
      {items.map(item => <button key={item.key} className="sims-nav-item" aria-current={page === item.key ? 'page' : undefined}
        aria-label={collapsed ? navLabel(item) : undefined} onClick={() => navigate(item.key)} {...hint(item.label)}>
        <NavIcon name={item.icon} size={18}/><span className={collapsed ? 'sims-nav-tooltip' : ''}>{item.label}</span>
        {badgeFor(item)?.count > 0 && <CountBadge count={badgeFor(item).count} label={badgeFor(item).label} />}
      </button>)}
    </nav>
    <AccountMenu me={me} collapsed={collapsed} onLogout={onLogout} hint={hint} />
  </aside>;
  return <div className={`app-shell sims-ui ${collapsed ? 'is-collapsed' : ''}`}>
    <style>{'body { margin:0; }'}</style>
    <a className="sims-skip" href="#sims-main" onClick={() => mainRef.current?.focus()}>Skip to content</a>
    {!mobile && sidebar}
    {mobile && drawer && <DialogFrame label="Main navigation" className="sims-drawer" onClose={() => setDrawer(false)} fallbackFocus={() => menuRef.current || mainRef.current}>
      <button type="button" className="sims-btn sims-btn--icon sims-drawer-close" onClick={() => setDrawer(false)} aria-label="Close navigation"><NavIcon name="close" size={18} /></button>
      <div id="sims-mobile-nav" style={{ height: '100%' }}>{sidebar}</div>
    </DialogFrame>}
    <div className="sims-content">
      {mobile && <header className="sims-mobilebar">
        <button ref={menuRef} type="button" className="sims-btn sims-btn--icon" aria-label="Open navigation" aria-expanded={drawer} aria-controls="sims-mobile-nav" onClick={() => setDrawer(true)}><NavIcon name="menu" size={20}/></button>
        <span className="sims-mobilebar-title">{pageLabel}</span>
        <span className="sims-school-year">SY {schoolYear}</span>
      </header>}
      <main id="sims-main" ref={mainRef} tabIndex={-1}>
        <div className="sims-page">
          <div className="sims-pagebar">
            <nav aria-label="Breadcrumb"><ol className="sims-crumbs"><li>BNHS SIMS</li><li aria-current="page">{pageLabel}</li></ol></nav>
            <span className="sims-school-year" title="Current school year">SY {schoolYear}</span>
          </div>
          <div key={page} className="sims-page-transition">{children}</div>
        </div>
      </main>
    </div>
    {tooltip && <div role="tooltip" className="sims-rail-tooltip" style={{ top:tooltip.top, left:tooltip.left }}>{tooltip.label}</div>}
  </div>;
}
