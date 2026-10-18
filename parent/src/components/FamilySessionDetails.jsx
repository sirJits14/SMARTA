import { useEffect, useRef, useState } from 'react';
import { callable } from '../firebase.js';
import { manilaDate, formatScanTime } from '../../../shared/dates.js';
import { schoolError, correctionTime } from '../lib/school.js';
import { Card, Field, Inp, Banner, Btn, Spinner } from './ui.jsx';
import './FamilySessionDetails.css';

export default function FamilySessionDetails({ studentId, requestedDate, requestedSession }) {
  const [date, setDate] = useState(requestedDate || manilaDate());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const sequence = useRef(0);
  useEffect(() => { setDate(requestedDate || manilaDate()); }, [studentId, requestedDate]);
  useEffect(() => {
    const request = ++sequence.current;
    setData(null); setError('');
    if (!date) { setLoading(false); return; }
    setLoading(true);
    callable('getFamilyAttendanceFn')({ studentId, date }).then(result => {
      if (request === sequence.current) { setData(result.data); setLoading(false); }
    }).catch(e => { if (request === sequence.current) { setError(schoolError(e)); setLoading(false); } });
    return () => { ++sequence.current; };
  }, [studentId, date, retry]);
  return <Card id="session-details"><h2 style={{ fontSize: 18, margin: '0 0 12px' }}>Session attendance</h2>
    <Field label="School day · Manila"><Inp type="date" value={date} max={manilaDate()} onChange={e => setDate(e.target.value)} /></Field>
    {loading && <Spinner label="Loading session attendance" />}
    {error && <Banner tone="danger" action={<Btn variant="ghost" onClick={() => setRetry(value => value + 1)}>Try again</Btn>}>{error}</Banner>}
    {data && <>{['am', 'pm'].map(session => <div key={session} aria-label={`${session.toUpperCase()} attendance`} style={{ padding: '12px 0', borderTop: '1px solid var(--t-border)', fontWeight: requestedSession === session ? 600 : 400 }}>
      <strong>{session.toUpperCase()} · {{ P: 'Present', L: 'Late', A: 'Absent', E: 'Excused' }[data[session]?.status] || 'No attendance mark'}</strong>
      {data[session]?.reason && <p style={{ margin: '8px 0', fontSize: 14 }}>{data[session].reason}</p>}
      {(data[session]?.actorName || data[session]?.changedAt) && <p className="family-session-note">{[data[session].actorName && `Updated by ${data[session].actorName}`, correctionTime(data[session].changedAt)].filter(Boolean).join(' · ')}</p>}
      <p className="family-session-note">Gate: {formatScanTime(data.gate?.[session === 'am' ? 'timeIn' : 'pmTimeIn'])} – {formatScanTime(data.gate?.[session === 'am' ? 'timeOut' : 'pmTimeOut'])}</p>
    </div>)}<p className="family-session-note">AM and PM attendance are recorded separately. Original gate scans appear below.</p></>}
  </Card>;
}
