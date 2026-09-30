import { useEffect, useRef, useState } from 'react';
import S from '../strings.js';
import { initials } from '../lib/format.js';
import Icon from './Icon.jsx';

function Avatar({ name, compact = false }) {
  return <span className={`learner-header-avatar${compact ? ' learner-header-avatar--small' : ''}`} aria-hidden="true">{initials(name)}</span>;
}

export default function LearnerHeader({ learner, navigate, todayStatus }) {
  const barRef = useRef(null);
  const titleRef = useRef(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const title = titleRef.current;
    const bar = barRef.current;
    if (!title || !bar) return;
    // The name collapses when it passes beneath the sticky controls.
    let observer;
    const observe = () => {
      observer?.disconnect();
      observer = new IntersectionObserver(([entry]) => setCollapsed(!entry.isIntersecting), {
        rootMargin: `-${bar.getBoundingClientRect().height}px 0px 0px 0px`,
      });
      observer.observe(title);
    };
    const resize = new ResizeObserver(observe);
    resize.observe(bar);
    observe();
    return () => { resize.disconnect(); observer?.disconnect(); };
  }, [learner?.displayName]);

  // A fragment, not a wrapper: a sticky element only sticks inside its parent,
  // so the bar must be a direct child of <main> to stay pinned over the whole
  // history rather than scrolling away with the expanded header.
  return (
    <>
      <div ref={barRef} className={`learner-header-bar${collapsed ? ' learner-header-bar--collapsed' : ''}`}>
        <button type="button" className="learner-header-back" aria-label={S.back} onClick={() => navigate('/')}>
          <Icon name="back" size={22} />
        </button>
        {learner && (
          <div className="learner-header-compact" aria-hidden="true">
            <Avatar name={learner.displayName} compact />
            <span className="learner-header-compact-name">{learner.displayName}</span>
          </div>
        )}
      </div>
      {learner && (
        <div className="learner-header-expanded">
          <Avatar name={learner.displayName} />
          <h1 ref={titleRef} className="learner-header-title">{learner.displayName}</h1>
          <div className="learner-header-section">{learner.sectionLabel} · {S.historyTitle}</div>
          <div className="learner-header-status">{todayStatus}</div>
        </div>
      )}
    </>
  );
}
