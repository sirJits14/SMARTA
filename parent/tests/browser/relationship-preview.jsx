import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../shared/theme/theme.css';
import '../../src/app.css';
import RelationshipRow from '../../src/components/RelationshipRow.jsx';
import RelationshipSheet from '../../src/components/RelationshipSheet.jsx';
import { ADVISER, isDepedEmail } from '../../src/lib/relationships.js';

const SY = '2026-2027';
const guardianLink = { status: 'active', schoolYear: SY, relationship: 'Mother', slot: 'guardian' };
const adviserLink = { status: 'active', schoolYear: SY, relationship: 'Adviser', slot: 'adviser' };
const CASES = [
  { id: 'adviser-picked-mother', title: 'DepEd adviser who picked Mother', email: 'teacher@deped.gov.ph', link: guardianLink },
  { id: 'teacher-picked-adviser', title: 'DepEd teacher who picked Adviser', email: 'parent@deped.gov.ph', link: adviserLink },
  { id: 'already-changed', title: 'Already changed this school year', email: 'teacher@deped.gov.ph', link: { ...adviserLink, previousRelationship: 'Mother', relationshipChangedFor: SY } },
  { id: 'gmail', title: 'Gmail parent: no row', email: 'ana@gmail.com', link: guardianLink },
  { id: 'adviser-full', title: 'Server refuses: adviser slot full', email: 'teacher@deped.gov.ph', link: guardianLink,
    refuse: { code: 'functions/failed-precondition', message: 'This learner already has an adviser linked. Ask the registrar to remove that link first.' } },
];

function Case({ c }) {
  const [link, setLink] = useState(c.link);
  const [open, setOpen] = useState(false);
  const save = async (relationship) => {
    await new Promise((r) => setTimeout(r, 300));
    if (c.refuse) throw c.refuse;
    setLink({ ...link, relationship, slot: relationship === ADVISER ? 'adviser' : 'guardian', previousRelationship: link.relationship, relationshipChangedFor: link.schoolYear });
  };
  return (
    <section data-case={c.id} style={{ padding: 16, borderBottom: '1px solid var(--t-border)' }}>
      <h2 style={{ fontSize: 13, margin: '0 0 8px' }}>{c.title}</h2>
      {isDepedEmail(c.email) && <RelationshipRow link={link} onChange={() => setOpen(true)} />}
      {open && <RelationshipSheet link={link} onSave={save} onClose={() => setOpen(false)} />}
    </section>
  );
}

createRoot(document.getElementById('root')).render(<main style={{ maxWidth: 480, margin: '0 auto' }}>
  <aside style={{ padding: 12, textAlign: 'center', fontSize: 12 }}>Synthetic links · no Firebase access · reload to start over</aside>
  {CASES.map((c) => <Case key={c.id} c={c} />)}
</main>);
