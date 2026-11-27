import { useState } from 'react';
import { useCollectionResource, useSchoolYearEnrollments, useStaffCollectionResource } from '../hooks/useCollection.js';
import { ResourceState } from '../components/ui.jsx';
import { isAdmin } from '../lib/access.js';
import { S } from '../styles.js';
import BySectionTab from './idCards/BySectionTab.jsx';
import SavedBatchTab from './idCards/SavedBatchTab.jsx';
import TempPassesTab from './idCards/TempPassesTab.jsx';

// 'queue' is kept as the key so a remembered tab still opens the batch.
const ADMIN_TABS = [['section', 'By section'], ['queue', 'Saved batch'], ['temp', 'Temporary passes']];
// Academic coordinators handle temporary passes only.
const COORDINATOR_TABS = [['temp', 'Temporary passes']];
const STORAGE = 'sims.idCards.tab';
const readTab = (tabs) => {
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

// Temporary passes read through the grade-scoped staff queries, so a
// coordinator never asks for rows outside their grades.
function TempPassesPanel({ me, schoolYear }) {
  const scope = { me, schoolYear };
  const resources = [
    useStaffCollectionResource('sections', scope),
    useStaffCollectionResource('enrollments', scope),
    useStaffCollectionResource('students', scope),
    useStaffCollectionResource('temp_passes', scope),
  ];
  if (resources.some(r => r.loading || r.error)) return <ResourceState resources={resources}/>;
  const [sections, enrollments, students, passes] = resources.map(r => r.data);
  return <TempPassesTab me={me} schoolYear={schoolYear} sections={sections} enrollments={enrollments} students={students} passes={passes} />;
}

export default function IDCardsPage({ me, schoolYear }) {
  const tabs = isAdmin(me) ? ADMIN_TABS : COORDINATOR_TABS;
  const [chosen, setTabState] = useState(() => readTab(tabs));
  const tab = tabs.some(([k]) => k === chosen) ? chosen : tabs[0][0];
  const setTab = (next) => {
    setTabState(next);
    try { localStorage.setItem(STORAGE, next); } catch { /* the tab still switches without storage */ }
  };

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
            }}>{label}</button>;
        })}
      </div>

      <div key={tab} role="tabpanel" id={`id-cards-panel-${tab}`} aria-labelledby={`id-cards-tab-${tab}`} className="sims-page-transition">
        {tab === 'temp' ? <TempPassesPanel me={me} schoolYear={schoolYear} /> : <OfficialCardsPanel tab={tab} me={me} schoolYear={schoolYear} />}
      </div>
    </div>
  );
}
