import SubTabs, { useStoredTab } from '../../components/SubTabs.jsx';
import SectionSlipsTab from './SectionSlipsTab.jsx';
import SlipBatchTab from './SlipBatchTab.jsx';

// Same pattern as the ID Cards page: issue a whole section, or a saved
// batch of chosen learners (spec 2026-10-16 §3).
const TABS = [['section', 'By section'], ['batch', 'Saved batch']];

export default function CodesTab({ me, schoolYear }) {
  const [tab, setTab] = useStoredTab('sims.slips.tab', TABS);
  return (
    <>
      <SubTabs tabs={TABS} value={tab} onChange={setTab} idPrefix="slips" label="Issue slips" className="codes-tab-controls sims-tabs"
        style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }} />
      <div key={tab} role="tabpanel" id={`slips-panel-${tab}`} aria-labelledby={`slips-tab-${tab}`}>
        {tab === 'section' ? <SectionSlipsTab schoolYear={schoolYear} /> : <SlipBatchTab me={me} schoolYear={schoolYear} />}
      </div>
    </>
  );
}
