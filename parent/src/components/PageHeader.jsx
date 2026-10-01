import { useEffect, useRef, useState } from 'react';
import S from '../strings.js';
import { initials } from '../lib/format.js';
import Icon from './Icon.jsx';

function Avatar({ name, compact = false }) {
  return <span className={`page-header-avatar${compact ? ' page-header-avatar--small' : ''}`} aria-hidden="true">{initials(name)}</span>;
}

// Large title that scrolls away with the page, plus a sticky bar that picks
// the title up once it has scrolled under it (iOS "large title" pattern).
// `avatarName` adds an initials avatar; `onBack` adds a back button.
export default function PageHeader({ title, subtitle, status, avatarName, onBack }) {
  const barRef = useRef(null);
  const titleRef = useRef(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const titleEl = titleRef.current;
    const bar = barRef.current;
    if (!titleEl || !bar) return;
    // The title collapses when it passes beneath the sticky bar.
    let observer;
    const observe = () => {
      observer?.disconnect();
      observer = new IntersectionObserver(([entry]) => setCollapsed(!entry.isIntersecting), {
        rootMargin: `-${bar.getBoundingClientRect().height}px 0px 0px 0px`,
      });
      observer.observe(titleEl);
    };
    const resize = new ResizeObserver(observe);
    resize.observe(bar);
    observe();
    return () => { resize.disconnect(); observer?.disconnect(); };
  }, [title]);

  // A fragment, not a wrapper: a sticky element only sticks inside its parent,
  // so the bar must be a direct child of <main> to stay pinned over the whole
  // page rather than scrolling away with the expanded header.
  return (
    <>
      <div ref={barRef} className={`page-header-bar${collapsed ? ' page-header-bar--collapsed' : ''}`}>
        {onBack && (
          <button type="button" className="page-header-back" aria-label={S.back} onClick={onBack}>
            <Icon name="back" size={22} />
          </button>
        )}
        {title && (
          <div className="page-header-compact" aria-hidden="true">
            {avatarName !== undefined && <Avatar name={avatarName} compact />}
            <span className="page-header-compact-title">{title}</span>
          </div>
        )}
      </div>
      {title && (
        <div className="page-header-expanded">
          {avatarName !== undefined && <Avatar name={avatarName} />}
          <h1 ref={titleRef} className="page-header-title">{title}</h1>
          {subtitle && <div className="page-header-subtitle">{subtitle}</div>}
          {status && <div className="page-header-status">{status}</div>}
        </div>
      )}
    </>
  );
}
