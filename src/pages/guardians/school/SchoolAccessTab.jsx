import { useEffect, useState } from 'react';
import { Btn } from '../../../components/ui.jsx';
import { T, S } from '../../../styles.js';
import { relativeAge } from '../../../lib/schoolAssignments.js';
import { useSchoolAccess } from './useSchoolAccess.js';
import SubTabs from './SubTabs.jsx';
import AssignRoleForm from './AssignRoleForm.jsx';
import PendingView from './PendingView.jsx';
import CoverageView from './CoverageView.jsx';
import AssignmentsView from './AssignmentsView.jsx';
import HistoryView from './HistoryView.jsx';

// School roles are requested in the app and reviewed here. The page opens on
// Pending when something waits, otherwise on Coverage.
export default function SchoolAccessTab() {
  const school = useSchoolAccess();
  const { context, loading, loadedAt, error, notice, refresh } = school;
  const [view, setView] = useState(null);
  const [draft, setDraft] = useState(null);
  const [focusRequest, setFocusRequest] = useState(null);
  const [, tick] = useState(0);
  const waiting = context?.pendingRequests?.length || 0;
  useEffect(() => { if (context?.isAdmin && !view) setView(waiting ? 'pending' : 'coverage'); }, [context, view, waiting]);
  useEffect(() => { const timer = setInterval(() => tick(n => n + 1), 60000); return () => clearInterval(timer); }, []);
  const tabs = [['pending', `Pending${waiting ? ` (${waiting})` : ''}`], ['coverage', 'Coverage'],
    ['assignments', `Assignments (${context?.managedAssignments?.length || 0})`], ['history', 'History']];
  return <div style={{ fontFamily: T.body }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
      <div>
        <h2 style={{ ...S.h2, margin: 0 }}>School access</h2>
        {context && <p style={{ margin: '4px 0 0', fontSize: 13, color: T.inkMuted }}>SY {context.schoolYear}{context.ended ? ' · ended, read only' : ''}</p>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 12, color: T.inkMuted }}>{loading ? 'Updating…' : loadedAt ? `Updated ${relativeAge(loadedAt)}` : ''}</span>
        <Btn variant="ghost" disabled={loading || school.pending} onClick={refresh}>Refresh</Btn>
        {context?.isAdmin && <Btn disabled={context.ended} onClick={() => setDraft({})}>Assign role</Btn>}
      </div>
    </div>
    {error && <p role="alert" className="sims-feedback">{error}</p>}
    {notice && <p role="status" className="sims-feedback is-success">{notice}</p>}
    {!context && loading && <p role="status">Loading school access…</p>}
    {context && !context.isAdmin && <p role="status">An administrator assigns school roles here in SIMS.</p>}
    {context?.isAdmin && view && <>
      <section aria-labelledby="advisory-requests-heading" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 0', marginBottom: 12, borderBottom: `1px solid ${T.border}` }}>
        <div>
          <h3 id="advisory-requests-heading" style={{ margin: 0, fontSize: 15, color: T.ink }}>Advisory section requests</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: T.inkMuted }}>
            {context.advisoryRequestsEnabled ? 'Open to teachers in the parent app. Advisory slips remain available either way.' : 'Closed in the parent app until you enable requests. Advisory slips remain available.'}
          </p>
        </div>
        <Btn variant={context.advisoryRequestsEnabled ? 'ghost-danger' : 'solid'} disabled={school.pending || context.ended}
          onClick={() => school.run('setAdvisoryRequestsEnabledFn', { enabled: !context.advisoryRequestsEnabled }, context.advisoryRequestsEnabled ? 'Advisory requests are closed.' : 'Advisory requests are open.') }>
          {context.advisoryRequestsEnabled ? 'Disable requests' : 'Enable requests'}
        </Btn>
      </section>
      {draft && <AssignRoleForm school={school} prefill={draft} onClose={() => setDraft(null)} />}
      <SubTabs id="school" label="School access views" tabs={tabs} value={view} onChange={setView} />
      <div role="tabpanel" id="school-panel" aria-labelledby={`school-tab-${view}`}>
        {view === 'pending' && <PendingView school={school} onUseLegacy={setDraft} focusId={focusRequest} />}
        {view === 'coverage' && <CoverageView context={context} onAssign={setDraft}
          onOpenRequest={requestId => { setFocusRequest(requestId); setView('pending'); }} />}
        {view === 'assignments' && <AssignmentsView school={school} />}
        {view === 'history' && <HistoryView sections={context.sections || []} />}
      </div>
    </>}
  </div>;
}
