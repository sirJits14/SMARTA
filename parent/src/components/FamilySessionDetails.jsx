import { useEffect, useRef, useState } from 'react';
import { callable } from '../firebase.js';
import { manilaDate } from '../../../shared/dates.js';
import { schoolError } from '../lib/school.js';
import { Field, Inp, Banner, Btn, Spinner } from './ui.jsx';
import SessionRows from './SessionRows.jsx';
import './FamilySessionDetails.css';

// The body of the Session attendance sheet: a school day picker and that day's rows.
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
  return <>
    <Field label="School day · Manila"><Inp type="date" value={date} max={manilaDate()} onChange={e => setDate(e.target.value)} /></Field>
    {loading && <Spinner label="Loading session attendance" />}
    {error && <Banner tone="danger" action={<Btn variant="ghost" onClick={() => setRetry(value => value + 1)}>Try again</Btn>}>{error}</Banner>}
    {data && <SessionRows data={data} requestedSession={date === requestedDate ? requestedSession : undefined} />}
  </>;
}
