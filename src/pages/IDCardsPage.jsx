import { useCollectionResource, useSchoolYearEnrollments } from '../hooks/useCollection.js';
import { ResourceState } from '../components/ui.jsx';
import SubTabs, { useStoredTab } from '../components/SubTabs.jsx';
import { S } from '../styles.js';
import BySectionTab from './idCards/BySectionTab.jsx';
import SavedBatchTab from './idCards/SavedBatchTab.jsx';

// 'queue' is kept as the key so a remembered tab still opens the batch.
const TABS = [['section', 'By section'], ['queue', 'Saved batch']];

export default function IDCardsPage({ me, schoolYear }) {
  const sectionsResource = useCollectionResource('sections');
  const enrollmentsResource = useSchoolYearEnrollments(schoolYear);
  const studentsResource = useCollectionResource('students');
  const batchResource = useCollectionResource('id_card_batch');
  const [tab, setTab] = useStoredTab('sims.idCards.tab', TABS);

  const resources = [sectionsResource, enrollmentsResource, studentsResource];
  if (resources.some(r => r.loading || r.error)) return <ResourceState resources={resources}/>;
  const data = { me, schoolYear, sections: sectionsResource.data, enrollments: enrollmentsResource.data, students: studentsResource.data };

  return (
    <div>
      <div className="id-cards-heading" style={S.plate}>
        <h1 style={S.h1}>ID Cards</h1>
      </div>

      <SubTabs tabs={TABS} value={tab} onChange={setTab} idPrefix="id-cards" className="id-cards-controls sims-tabs"
        style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }} />

      <div key={tab} role="tabpanel" id={`id-cards-panel-${tab}`} aria-labelledby={`id-cards-tab-${tab}`} className="sims-page-transition">
        {tab === 'section' ? <BySectionTab {...data} /> : <ResourceState resources={[batchResource]}><SavedBatchTab {...data} batchDocs={batchResource.data} /></ResourceState>}
      </div>
    </div>
  );
}
