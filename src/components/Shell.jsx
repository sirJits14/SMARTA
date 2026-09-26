import { useEffect, useRef, useState } from 'react';
import { Card } from './ui.jsx';
import DialogFrame from './DialogFrame.jsx';
import NavIcon from './NavIcon.jsx';
import { NAV_ITEMS } from '../lib/navigation.js';
import bnhsLogo from '../assets/bnhs_logo.png';

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
  const collapsed = !mobile && (preference ?? width < 1024);
  useEffect(() => {
    const resize = () => { setWidth(window.innerWidth); setTooltip(null); if (window.innerWidth >= 768) setDrawer(false); };
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const toggle = () => { const next = !collapsed; setPreference(next); setTooltip(null); try { localStorage.setItem(STORAGE, String(next)); } catch { /* navigation works without storage */ } };
  const navigate = key => { setPage(key); setDrawer(false); setTooltip(null); };
  const showLabel = (event, label) => { if (collapsed) setTooltip({ label, top: event.currentTarget.getBoundingClientRect().top }); };
  const sidebar = <Card as="aside" surface="navigation" className="app-sidebar">
    <div className="sims-brand"><img src={bnhsLogo} alt="Bukidnon National High School seal" width="32" height="32" />
      {!collapsed && <div><strong>BNHS SIMS</strong><small>Learner records</small></div>}</div>
    <nav className="sims-nav" aria-label="Main navigation">
      {NAV_ITEMS.map(item => <button key={item.key} className="sims-nav-item" aria-current={page === item.key ? 'page' : undefined}
        aria-label={collapsed ? item.label : undefined} onClick={() => navigate(item.key)}
        onMouseEnter={e => showLabel(e,item.label)} onMouseLeave={() => setTooltip(null)}
        onFocus={e => showLabel(e,item.label)} onBlur={() => setTooltip(null)}>
        <NavIcon name={item.icon}/><span className={collapsed ? 'sims-nav-tooltip' : ''}>{item.label}</span>
      </button>)}
    </nav>
    <div className="sims-account">
      {!collapsed && <><div className="sims-account-name">{me.name}</div><div className="sims-account-role">Registrar</div></>}
      <button className="sims-nav-item" aria-label={collapsed ? `Sign out, ${me.name}` : undefined} onClick={onLogout}
        onMouseEnter={e => showLabel(e,'Sign out')} onMouseLeave={() => setTooltip(null)} onFocus={e => showLabel(e,'Sign out')} onBlur={() => setTooltip(null)}>
        <NavIcon name="logout"/><span className={collapsed ? 'sims-nav-tooltip' : ''}>Sign out</span></button>
      {!mobile && <button className="sims-nav-item" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} onClick={toggle}>
        <span style={{ display:'flex', transform:collapsed ? 'rotate(180deg)' : undefined }}><NavIcon name="collapse"/></span>
        {!collapsed && <span>Collapse sidebar</span>}</button>}
    </div>
  </Card>;
  return <div className={`app-shell sims-ui ${collapsed ? 'is-collapsed' : ''}`}>
    <style>{'body { margin:0; }'}</style>
    <a className="sims-skip" href="#sims-main" onClick={() => mainRef.current?.focus()}>Skip to content</a>
    {!mobile && sidebar}
    {mobile && drawer && <DialogFrame label="Main navigation" className="sims-drawer" onClose={() => setDrawer(false)} fallbackFocus={() => menuRef.current || mainRef.current}>
      <button className="sims-icon-button" style={{ position:'absolute', right:8, top:8, zIndex:1 }} onClick={() => setDrawer(false)} aria-label="Close navigation"><NavIcon name="close" /></button>
      <div id="sims-mobile-nav">{sidebar}</div>
    </DialogFrame>}
    <div className="sims-content">
      <Card surface="navigation" className="app-topbar">
        <div className="sims-topbar-title">{mobile && <button ref={menuRef} className="sims-icon-button" aria-label="Open navigation" aria-expanded={drawer} aria-controls="sims-mobile-nav" onClick={() => setDrawer(true)}><NavIcon name="menu"/></button>}
          <span>{NAV_ITEMS.find(item => item.key === page)?.label || 'BNHS SIMS'}</span></div>
        <span className="sims-school-year">SY {schoolYear}</span>
      </Card>
      <main id="sims-main" ref={mainRef} tabIndex={-1}>{children}</main>
    </div>
    {tooltip && <div role="tooltip" className="sims-rail-tooltip" style={{ top:tooltip.top }}>{tooltip.label}</div>}
  </div>;
}
