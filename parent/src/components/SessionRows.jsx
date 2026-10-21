import { formatScanTime } from '../../../shared/dates.js';
import { correctionTime } from '../lib/school.js';
import { sessionRows, sessionFootnote } from '../lib/sessionRows.js';
import S from '../strings.js';

const MARKS = { P: 'Present', L: 'Late', A: 'Absent', E: 'Excused' };
const GATE = { am: ['timeIn', 'timeOut'], pm: ['pmTimeIn', 'pmTimeOut'] };

// One row per session in the learner's SIMS schedule, from a
// getFamilyAttendanceFn result. No Firebase here, so previews can render it.
export default function SessionRows({ data, requestedSession, renderAction }) {
  const rows = sessionRows(data.schedule);
  // A single-session day keeps its data in `am`, so any requested session is that row.
  const highlight = requestedSession && rows.length === 1 ? 'am' : requestedSession;
  return <>
    {rows.map(({ key, label }) => {
      const session = data[key];
      const [inKey, outKey] = GATE[key];
      return <div key={key} role="group" aria-label={label} style={{ padding: '12px 0', borderTop: '1px solid var(--t-border)', fontWeight: highlight === key ? 600 : 400 }}>
        <strong style={{ display: 'block' }}>{label}</strong>
        <p style={{ margin: '4px 0 0', fontSize: 15 }}>{MARKS[session?.status] || S.sessionNoMark}</p>
        {session?.reason && <p style={{ margin: '8px 0', fontSize: 14 }}>{session.reason}</p>}
        {(session?.actorName || session?.changedAt) && <p className="family-session-note">{[session.actorName && `Updated by ${session.actorName}`, correctionTime(session.changedAt)].filter(Boolean).join(' · ')}</p>}
        <p className="family-session-note">Gate: {formatScanTime(data.gate?.[inKey])} – {formatScanTime(data.gate?.[outKey])}</p>
        {renderAction?.(key)}
      </div>;
    })}
    <p className="family-session-note">{sessionFootnote(rows)}</p>
  </>;
}
