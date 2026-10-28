import { useEffect, useRef, useState } from 'react';
import { Btn } from '../components/ui.jsx';
import { T, S } from '../styles.js';
import { relativeAge } from '../lib/schoolAssignments.js';
import { decidableCount, decisionNotice, waitingCutNote, waitingTabLabel } from '../lib/learnerRequests.js';
import SubTabs from './guardians/school/SubTabs.jsx';
import WaitingList from './learnerRequests/WaitingList.jsx';
import DecidedList from './learnerRequests/DecidedList.jsx';
import { shouldLoadDecided, useLearnerRequestLists } from './learnerRequests/useLearnerRequestLists.js';

// A message that appears at the top of a long page is out of sight when the card that raised it was far below:
// bring it into view and move focus to it (it carries tabIndex -1). Not every environment has scrollIntoView.
export const revealMessage = (node) => {
  if (!node) return;
  if (typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'nearest' });
  node.focus?.({ preventScroll: true });
};

// Advisers ask in the parent app to add or remove a learner; an Administrator, or whoever covers the grade,
// decides here (spec 2026-10-22). The server filters both lists to what this person may see.
export default function LearnerRequestsPage({ schoolYear }) {
  const lists = useLearnerRequestLists();
  const { waiting, decided, loading, loadedAt, error, notice, pending, pendingId, failures } = lists;
  const [view, setView] = useState('waiting');
  const [, tick] = useState(0);
  const alertRef = useRef(null);
  const noticeRef = useRef(null);
  const count = waiting ? decidableCount(waiting.requests) : 0;
  const ended = Boolean(waiting?.ended);
  const cutNote = waitingCutNote(waiting);
  // Depends on loading and error too, so Decided opened during a reload loads when it ends, and Refresh after a failure retries.
  useEffect(() => { if (shouldLoadDecided({ view, decided, loading, error })) lists.loadDecided(false); }, [view, decided, loading, error]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const timer = setInterval(() => tick(n => n + 1), 60000); return () => clearInterval(timer); }, []);
  // Keyed on the text, so it acts after a decision or a load and never while someone types in a Reject form.
  useEffect(() => { if (error) revealMessage(alertRef.current); }, [error]);
  useEffect(() => { if (notice) revealMessage(noticeRef.current); }, [notice]);
  // Choosing Decided with nothing loaded also drops an old message (a refused decision, a failed load), in the
  // same click, so the effect above sees the new tab and the clear together and loads once. Only a click clears it.
  // Changing tab drops the last decision's notice too, so it does not sit above a different list.
  const openView = (next) => {
    if (next !== view) lists.clearNotice();
    setView(next);
    if (next === 'decided' && !decided) lists.clearError();
  };
  const tabs = [['waiting', waitingTabLabel(count, waiting?.truncated)], ['decided', 'Decided']];
  return <div style={{ fontFamily: T.body }}>
    <div className="sims-heading" style={S.plate}>
      <h1 style={S.h1}>Learner requests</h1>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 12, color: T.inkMuted }}>{loading ? 'Updating…' : loadedAt ? `Updated ${relativeAge(loadedAt)}` : ''}</span>
        <Btn variant="ghost" disabled={loading || pending} onClick={() => { lists.clearNotice(); lists.refresh(); }}>Refresh</Btn>
      </div>
    </div>
    <p style={{ margin: '12px 0 16px', fontSize: 13, color: T.inkMuted }}>SY {schoolYear}{ended ? ' · ended, read only' : ''}</p>
    {error && <p ref={alertRef} tabIndex={-1} role="alert" className="sims-feedback">{error}</p>}
    {notice && <p ref={noticeRef} tabIndex={-1} role="status" className="sims-feedback is-success">{notice}</p>}
    {!waiting && loading && <p role="status">Loading learner requests…</p>}
    {waiting && <>
      <SubTabs id="learner-requests" label="Learner request views" tabs={tabs} value={view} onChange={openView} />
      <div role="tabpanel" id="learner-requests-panel" aria-labelledby={`learner-requests-tab-${view}`}>
        {view === 'waiting'
          ? <>
            {cutNote && <p role="status" style={{ margin: '0 0 12px', fontSize: 13, color: T.inkMuted }}>{cutNote}</p>}
            <WaitingList requests={waiting.requests} ended={ended} pending={pending} pendingId={pendingId} failures={failures}
              onApprove={request => lists.decide(request, true, '', result => decisionNotice(request, result))}
              // Rejecting is always a rejection, whatever mode an older server sends back.
              onReject={(request, reason) => lists.decide(request, false, reason, result => decisionNotice(request, { ...result, mode: 'rejected' }))} />
          </>
          : <DecidedList decided={decided} loading={loading} onMore={() => lists.loadDecided(true)} />}
      </div>
    </>}
  </div>;
}
