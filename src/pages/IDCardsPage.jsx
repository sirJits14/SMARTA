import { useState } from 'react';
import { useCollectionResource, useSchoolYearEnrollments, useStaffCollectionResource } from '../hooks/useCollection.js';
import { ResourceState } from '../components/ui.jsx';
import { isAdmin } from '../lib/access.js';
import { canManagePasses } from '../../shared/tempPass.js';
import { S } from '../styles.js';
import BySectionTab from './idCards/BySectionTab.jsx';
import SavedBatchTab from './idCards/SavedBatchTab.jsx';
import TempPassesTab from './idCards/TempPassesTab.jsx';
import PassRequestsTab, { requestsTabLabel, usePassRequestList } from './idCards/PassRequestsTab.jsx';

export { requestsTabLabel };

// 'queue' is kept as the key so a remembered tab still opens the batch.
const ADMIN_TABS = [['section', 'By section'], ['queue', 'Saved batch'], ['requests', 'Requests'], ['temp', 'Temporary passes']];
// Grade level coordinators and logistic operators handle temporary passes only.
const PASS_TABS = [['requests', 'Requests'], ['temp', 'Temporary passes']];
const PASS_TAB_KEYS = ['requests', 'temp'];
const STORAGE = 'sims.idCards.tab';
const readTab = (tabs) => {
  if (!tabs.length) return '';
  try { const v = localStorage.getItem(STORAGE); return tabs.some(([k]) => k === v) ? v : tabs[0][0]; }
  catch { return tabs[0][0]; }
};

// Official cards: administrators only, from the whole-school collections.
function OfficialCardsPanel({ tab, me, schoolYear }) {
  const sectionsResource = useCollectionResource('sections');
  const enrollmentsResource = useSchoolYearEnrollments(schoolYear);
  const studentsResource = useCollectionResource('students');
  const batchResource = useCollectionResource('id_card_batch');
  const resources = [sectionsResource, enrollmentsResource, studentsResource];
  if (resources.some(r => r.loading || r.error)) return <ResourceState resources={resources}/>;
  const data = { me, schoolYear, sections: sectionsResource.data, enrollments: enrollmentsResource.data, students: studentsResource.data };
  return tab === 'section'
    ? <BySectionTab {...data} />
    : <ResourceState resources={[batchResource]}><SavedBatchTab {...data} batchDocs={batchResource.data} /></ResourceState>;
}

// Requests and temporary passes read through the staff-scoped queries, so a grade level
// coordinator never asks for rows outside their grade and a logistic operator reads only
// sections, enrollments, learners and passes (plus settings/app in the tabs).
function PassesPanel({ tab, me, schoolYear, pending }) {
  const scope = { me, schoolYear };
  const resources = [
    useStaffCollectionResource('sections', scope),
    useStaffCollectionResource('enrollments', scope),
    useStaffCollectionResource('students', scope),
    useStaffCollectionResource('temp_passes', scope),
  ];
  if (resources.some(r => r.loading || r.error)) return <ResourceState resources={resources}/>;
  const [sections, enrollments, students, passes] = resources.map(r => r.data);
  const data = { me, schoolYear, sections, enrollments, students, passes, pending, onRequestsChanged: pending.reload };
  return tab === 'requests' ? <PassRequestsTab {...data} /> : <TempPassesTab {...data} />;
}

export default function IDCardsPage({ me, schoolYear }) {
  const printer = canManagePasses(me);
  const tabs = isAdmin(me) ? ADMIN_TABS : printer ? PASS_TABS : [];
  const [chosen, setTabState] = useState(() => readTab(tabs));
  const tab = tabs.some(([k]) => k === chosen) ? chosen : tabs[0]?.[0];
  // Waiting requests: counted on the tab and shared by both pass tabs.
  const pending = usePassRequestList('pending', printer);
  const setTab = (next) => {
    setTabState(next);
    // Both pass tabs route learners with a waiting request through it, so they need a fresh list.
    if (PASS_TAB_KEYS.includes(next) && printer) pending.reload();
    try { localStorage.setItem(STORAGE, next); } catch { /* the tab still switches without storage */ }
  };
  const labelOf = (k, label) => (k === 'requests' ? requestsTabLabel(pending.requests.length, pending.truncated) : label);

  if (!tab) {
    return (
      <div>
        <div className="id-cards-heading" style={S.plate}><h1 style={S.h1}>ID Cards</h1></div>
        <p role="status">ID cards and temporary passes are handled by administrators, grade level coordinators and logistic operators.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="id-cards-heading" style={S.plate}>
        <h1 style={S.h1}>ID Cards</h1>
      </div>

      <div className="id-cards-controls sims-tabs" role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
        {tabs.map(([k, label]) => {
          const active = tab === k;
          return <button key={k} role="tab" className="sims-tab" id={`id-cards-tab-${k}`}
            aria-selected={active} aria-controls={`id-cards-panel-${k}`} tabIndex={active ? 0 : -1}
            onClick={() => setTab(k)} onKeyDown={event => {
              const index = tabs.findIndex(([key]) => key === k);
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 :
                event.key === 'ArrowRight' ? (index + 1) % tabs.length :
                event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : null;
              if (next === null) return;
              event.preventDefault(); setTab(tabs[next][0]);
              document.getElementById(`id-cards-tab-${tabs[next][0]}`)?.focus();
            }}>{labelOf(k, label)}</button>;
        })}
      </div>

      <div key={tab} role="tabpanel" id={`id-cards-panel-${tab}`} aria-labelledby={`id-cards-tab-${tab}`} className="sims-page-transition">
        {PASS_TAB_KEYS.includes(tab)
          ? <PassesPanel tab={tab} me={me} schoolYear={schoolYear} pending={pending} />
          : <OfficialCardsPanel tab={tab} me={me} schoolYear={schoolYear} />}
      </div>
    </div>
  );
}
