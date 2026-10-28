import { useEffect, useState } from 'react';
import { Btn } from '../components/ui.jsx';
import { T, S } from '../styles.js';
import { relativeAge } from '../lib/schoolAssignments.js';
import { decidableCount, decisionNotice, waitingCutNote } from '../lib/learnerRequests.js';
import SubTabs from './guardians/school/SubTabs.jsx';
import WaitingList from './learnerRequests/WaitingList.jsx';
import DecidedList from './learnerRequests/DecidedList.jsx';
import { shouldLoadDecided, useLearnerRequestLists } from './learnerRequests/useLearnerRequestLists.js';

// Advisers ask in the parent app to add or remove a learner; an Administrator, or whoever covers the grade,
// decides here (spec 2026-10-22). The server filters both lists to what this person may see.
export default function LearnerRequestsPage({ schoolYear }) {
  const lists = useLearnerRequestLists();
  const { waiting, decided, loading, loadedAt, error, notice, pending, failures } = lists;
  const [view, setView] = useState('waiting');
  const [, tick] = useState(0);
  const count = waiting ? decidableCount(waiting.requests) : 0;
  const ended = Boolean(waiting?.ended);
  const cutNote = waitingCutNote(waiting);
  // Depends on loading and error too, so Decided opened during a reload loads when it ends, and Refresh after a failure retries.
  useEffect(() => { if (shouldLoadDecided({ view, decided, loading, error })) lists.loadDecided(false); }, [view, decided, loading, error]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const timer = setInterval(() => tick(n => n + 1), 60000); return () => clearInterval(timer); }, []);
  // Choosing Decided with nothing loaded also drops an old message (a refused decision, a failed load), in the
  // same click, so the effect above sees the new tab and the clear together and loads once. Only a click clears it.
  const openView = (next) => { setView(next); if (next === 'decided' && !decided) lists.clearError(); };
  const tabs = [['waiting', `Waiting${count ? ` (${count})` : ''}`], ['decided', 'Decided']];
  return <div style={{ fontFamily: T.body }}>
    <div className="sims-heading" style={S.plate}>
      <h1 style={S.h1}>Learner requests</h1>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 12, color: T.inkMuted }}>{loading ? 'Updating…' : loadedAt ? `Updated ${relativeAge(loadedAt)}` : ''}</span>
        <Btn variant="ghost" disabled={loading || pending} onClick={lists.refresh}>Refresh</Btn>
      </div>
    </div>
    <p style={{ margin: '12px 0 16px', fontSize: 13, color: T.inkMuted }}>SY {schoolYear}{ended ? ' · ended, read only' : ''}</p>
    {error && <p role="alert" className="sims-feedback">{error}</p>}
    {notice && <p role="status" className="sims-feedback is-success">{notice}</p>}
    {!waiting && loading && <p role="status">Loading learner requests…</p>}
    {waiting && <>
      <SubTabs id="learner-requests" label="Learner request views" tabs={tabs} value={view} onChange={openView} />
      <div role="tabpanel" id="learner-requests-panel" aria-labelledby={`learner-requests-tab-${view}`}>
        {view === 'waiting'
          ? <>
            {cutNote && <p role="status" className="sims-feedback is-success" style={{ margin: '0 0 12px' }}>{cutNote}</p>}
            <WaitingList requests={waiting.requests} ended={ended} pending={pending} failures={failures}
              onApprove={request => lists.decide(request, true, '', result => decisionNotice(request, result))}
              // Rejecting is always a rejection, whatever mode an older server sends back.
              onReject={(request, reason) => lists.decide(request, false, reason, result => decisionNotice(request, { ...result, mode: 'rejected' }))} />
          </>
          : <DecidedList decided={decided} loading={loading} onMore={() => lists.loadDecided(true)} />}
      </div>
    </>}
  </div>;
}
