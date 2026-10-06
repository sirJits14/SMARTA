import { useState } from 'react';
import { useCollectionResource } from '../hooks/useCollection.js';
import { ResourceState } from '../components/ui.jsx';
import { S } from '../styles.js';
import BySectionTab from './idCards/BySectionTab.jsx';
import PrintQueueTab from './idCards/PrintQueueTab.jsx';

const TABS = [['section', 'By section'], ['queue', 'Print queue']];
const STORAGE = 'sims.idCards.tab';
const readTab = () => {
  try { const v = localStorage.getItem(STORAGE); return TABS.some(([k]) => k === v) ? v : 'section'; }
  catch { return 'section'; }
};

export default function IDCardsPage({ me, schoolYear }) {
  const sectionsResource = useCollectionResource('sections');
  const enrollmentsResource = useCollectionResource('enrollments');
  const studentsResource = useCollectionResource('students');
  const [tab, setTabState] = useState(readTab);
  const setTab = (next) => {
    setTabState(next);
    try { localStorage.setItem(STORAGE, next); } catch { /* the tab still switches without storage */ }
  };

  const resources = [sectionsResource, enrollmentsResource, studentsResource];
  if (resources.some(r => r.loading || r.error)) return <ResourceState resources={resources}/>;
  const data = { me, schoolYear, sections: sectionsResource.data, enrollments: enrollmentsResource.data, students: studentsResource.data };

  return (
    <div>
      <div className="id-cards-heading" style={S.plate}>
        <h1 style={S.h1}>ID Cards</h1>
      </div>

      <div className="id-cards-controls sims-tabs" role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
        {TABS.map(([k, label]) => {
          const active = tab === k;
          return <button key={k} role="tab" className="sims-tab" id={`id-cards-tab-${k}`}
            aria-selected={active} aria-controls={`id-cards-panel-${k}`} tabIndex={active ? 0 : -1}
            onClick={() => setTab(k)} onKeyDown={event => {
              const index = TABS.findIndex(([key]) => key === k);
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 :
                event.key === 'ArrowRight' ? (index + 1) % TABS.length :
                event.key === 'ArrowLeft' ? (index - 1 + TABS.length) % TABS.length : null;
              if (next === null) return;
              event.preventDefault(); setTab(TABS[next][0]);
              document.getElementById(`id-cards-tab-${TABS[next][0]}`)?.focus();
            }}>{label}</button>;
        })}
      </div>

      <div key={tab} role="tabpanel" id={`id-cards-panel-${tab}`} aria-labelledby={`id-cards-tab-${tab}`} className="sims-page-transition">
        {tab === 'section' ? <BySectionTab {...data} /> : <PrintQueueTab {...data} />}
      </div>
    </div>
  );
}
