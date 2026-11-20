import { useEffect, useMemo, useRef, useState } from 'react';
import WidgetCard from '../WidgetCard.jsx';
import { Btn, EmptyState } from '../../ui.jsx';
import NavIcon from '../../NavIcon.jsx';
import { audienceLabel } from '../../../lib/announcements.js';
import { postDate, postsByDay, upcomingPosts } from '../../../lib/dashboardStats.js';
import { addDays, dayLabel, manilaDay, monthGrid, monthLabel, shiftMonth } from '../../../lib/dates.js';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const STEP = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
const FULL_DATE = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };

function MonthNav({ month, onMonth }) {
  return <div className="sims-cal-head">
    <strong aria-live="polite">{monthLabel(month)}</strong>
    <span>
      <Btn variant="icon" aria-label="Previous month" onClick={() => onMonth(shiftMonth(month, -1))}><NavIcon name="collapse" size={16} /></Btn>
      <Btn variant="icon" aria-label="Next month" onClick={() => onMonth(shiftMonth(month, 1))}><NavIcon name="chevronRight" size={16} /></Btn>
    </span>
  </div>;
}

// Month grid with a roving tab stop: arrows move by day or week, Home/End jump to the week's ends,
// Page Up/Down change month. Focus is restored after render because a month change remounts the cells.
function MonthGrid({ month, onMonth, today, selectedDay, onSelectDay, marks }) {
  const gridRef = useRef(null);
  const pendingFocus = useRef(null);
  const [focusDay, setFocusDay] = useState(null);
  const weeks = monthGrid(month);
  const days = weeks.flat().map((d) => d.date);
  const active = [focusDay, selectedDay, today, `${month}-01`].find((d) => d && d.startsWith(month) && days.includes(d));
  useEffect(() => {
    if (!pendingFocus.current) return;
    const el = gridRef.current?.querySelector(`[data-date="${pendingFocus.current}"]`);
    if (el) { el.focus(); pendingFocus.current = null; }
  });
  const moveTo = (date) => {
    pendingFocus.current = date;
    setFocusDay(date);
    if (date.slice(0, 7) !== month) onMonth(date.slice(0, 7));
  };
  const onKeyDown = (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (STEP[e.key]) { e.preventDefault(); moveTo(addDays(active, STEP[e.key])); }
    else if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); moveTo(`${shiftMonth(month, e.key === 'PageUp' ? -1 : 1)}-01`); }
    else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const week = weeks.find((w) => w.some((d) => d.date === active));
      if (week) moveTo(week[e.key === 'Home' ? 0 : 6].date);
    }
  };
  return <div role="grid" aria-label={monthLabel(month)} ref={gridRef} className="sims-cal-grid" onKeyDown={onKeyDown}>
    <div role="row" className="sims-cal-row">{WEEKDAYS.map((w) => <span role="columnheader" key={w} className="sims-cal-dow">{w}</span>)}</div>
    {weeks.map((week) => <div role="row" key={week[0].date} className="sims-cal-row">{week.map((d) => {
      const count = marks[d.date]?.length || 0;
      const cls = ['sims-cal-day', !d.inMonth && 'is-outside', d.weekend && 'is-weekend', d.date === today && 'is-today', d.date === selectedDay && 'is-selected'].filter(Boolean).join(' ');
      return <span role="gridcell" key={d.date} aria-selected={d.date === selectedDay}>
        <button type="button" data-date={d.date} tabIndex={d.date === active ? 0 : -1} className={cls}
          aria-current={d.date === today ? 'date' : undefined}
          aria-label={`${dayLabel(d.date, FULL_DATE)}${count ? `, ${count} post${count === 1 ? '' : 's'}` : ''}`}
          onClick={() => { setFocusDay(d.date); if (!d.inMonth) onMonth(d.date.slice(0, 7)); onSelectDay(selectedDay === d.date ? null : d.date); }}>
          {Number(d.date.slice(8))}
          {count > 0 && <span className="sims-cal-dot" aria-hidden="true" />}
        </button>
      </span>;
    })}</div>)}
  </div>;
}

const useMarks = (data) => useMemo(() => postsByDay(data.posts, data.nowMs), [data.posts, data.nowMs]);
const postDay = (p) => manilaDay(postDate(p));

function PostRows({ posts }) {
  return <ul className="sims-list">{posts.map((p) => <li key={p.id} className="sims-upcoming-row">
    <span className="sims-date-chip">{dayLabel(postDay(p), { month: 'short', day: 'numeric' })}</span>
    <span><strong>{p.title}</strong><small>{audienceLabel(p.audienceKeys, p.audience)}</small></span>
  </li>)}</ul>;
}

export function CalendarCard({ data, month, onMonth, selectedDay, onSelectDay, expanded, onExpand }) {
  const marks = useMarks(data);
  return <WidgetCard title="Calendar" expanded={expanded} onExpand={onExpand} resources={data.resources.posts} label="calendar">
    <MonthNav month={month} onMonth={onMonth} />
    <MonthGrid month={month} onMonth={onMonth} today={data.today} selectedDay={selectedDay} onSelectDay={onSelectDay} marks={marks} />
  </WidgetCard>;
}

export function UpcomingCard({ data, selectedDay, onSelectDay, expanded, onExpand }) {
  const posts = upcomingPosts({ posts: data.posts, nowMs: data.nowMs, day: selectedDay, limit: 3 });
  const title = selectedDay ? `Posts on ${dayLabel(selectedDay, { month: 'short', day: 'numeric' })}` : 'Upcoming posts';
  return <WidgetCard title={title} expanded={expanded} onExpand={onExpand} resources={data.resources.posts} label="upcoming posts"
    footer={selectedDay && <Btn variant="quiet" onClick={() => onSelectDay(null)}>Show upcoming</Btn>}>
    {posts.length ? <PostRows posts={posts} />
      : selectedDay ? <EmptyState title="No posts on this day" hint="Pick another day, or show upcoming posts." />
        : <EmptyState title="No upcoming posts" hint="Scheduled announcements will appear here." />}
  </WidgetCard>;
}

export function CalendarDetail({ data, month, onMonth }) {
  const marks = useMarks(data);
  const days = Object.keys(marks).filter((d) => d.startsWith(month)).sort();
  return <>
    <MonthNav month={month} onMonth={onMonth} />
    {days.length ? days.map((d) => <section key={d} className="sims-drawer-section">
      <h3>{dayLabel(d, { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
      <PostRows posts={marks[d]} />
    </section>) : <EmptyState title="No posts this month" hint="Published and scheduled announcements appear on their day." />}
  </>;
}
