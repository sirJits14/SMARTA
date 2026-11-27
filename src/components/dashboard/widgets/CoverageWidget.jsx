import WidgetCard from '../WidgetCard.jsx';
import { ListRow } from '../parts.jsx';
import { EmptyState } from '../../ui.jsx';
import { isWeekend } from '../../../lib/dates.js';

const sectionMeta = (s) => `Grade ${s.gradeLevel}${s.strand ? ` · ${s.strand}` : ''}`;

function SectionLinks({ sections, onPick }) {
  return <ul className="sims-list">{sections.map((s) => <li key={s.id}>
    <ListRow title={s.name} meta={sectionMeta(s)} action="Take attendance" onClick={() => onPick(s)} />
  </li>)}</ul>;
}

export function CoverageCard({ data, expanded, onExpand, onTakeAttendance }) {
  const { recordedCount, totalSections, percent, pendingSections } = data.coverage;
  const weekend = isWeekend(data.today);
  return <WidgetCard title="Attendance coverage" subtitle={weekend ? 'No school day today' : 'Sections with a record today'}
    expanded={expanded} onExpand={onExpand} resources={data.resources.roster} label="attendance coverage">
    {totalSections ? <>
      {weekend ? <>
        <div className="sims-metric">—</div>
        <p className="sims-widget-note">No school day today</p>
      </> : <>
        <div className="sims-metric">{percent}<span>%</span></div>
        <progress className="sims-progress" aria-label="Sections with attendance records today" max={totalSections} value={recordedCount} />
        <p className="sims-widget-note">{recordedCount} of {totalSections} enrolled sections</p>
      </>}
      {!weekend && pendingSections.length > 0 && <SectionLinks sections={pendingSections.slice(0, 3)} onPick={onTakeAttendance} />}
    </> : <EmptyState title="No enrolled sections" hint="Enroll learners to begin recording attendance." />}
  </WidgetCard>;
}

export function CoverageDetail({ data, onTakeAttendance }) {
  const { eligibleSections, pendingSections } = data.coverage;
  const pendingIds = new Set(pendingSections.map((s) => s.id));
  const recorded = eligibleSections.filter((s) => !pendingIds.has(s.id));
  return <>
    {isWeekend(data.today)
      ? <section className="sims-drawer-section"><p className="sims-widget-note">No school day today</p></section>
      : <section className="sims-drawer-section"><h3>Waiting for a record ({pendingSections.length})</h3>
        {pendingSections.length ? <SectionLinks sections={pendingSections} onPick={onTakeAttendance} />
          : <EmptyState title="Every section has a record" hint="All enrolled sections have attendance for today." />}
      </section>}
    <section className="sims-drawer-section"><h3>Recorded ({recorded.length})</h3>
      {recorded.length ? <ul className="sims-list">{recorded.map((s) => <li key={s.id} className="sims-list-static"><strong>{s.name}</strong><small>{sectionMeta(s)}</small></li>)}</ul>
        : <EmptyState title="Nothing recorded yet" hint="Sections appear here once attendance is saved today." />}
    </section>
    <p className="sims-widget-note">Records may come from registrar entry or kiosk activity. This does not indicate completed review or learner presence.</p>
  </>;
}
