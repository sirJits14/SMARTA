import S from '../strings.js';
import { T } from '../styles.js';
import { Banner } from './ui.jsx';
import { initials, nameCase } from '../lib/format.js';
import { useRelationshipSheet } from '../hooks/useRelationshipSheet.jsx';

// Home, DepEd accounts only: links made with an old adviser slip grant
// nothing since school roles moved to SIMS, so Home leaves them out of the
// learner list. A teacher who is really the learner's parent can move the
// link to their family relationship once per school year.
export default function LegacyAdviserLinks({ links }) {
  const { show, sheet, err } = useRelationshipSheet();
  if (!links?.length) return null;
  return (
    <section aria-labelledby="legacy-adviser-title" style={{ marginTop: 8 }}>
      <h2 id="legacy-adviser-title" style={{ fontSize: 15, margin: '0 0 4px' }}>{S.legacyAdviserTitle}</h2>
      <p style={{ fontSize: 13, color: T.inkMuted, margin: '0 0 8px' }}>{S.legacyAdviserHint}</p>
      {err && <Banner tone="danger">{err}</Banner>}
      <ul className="learner-list" aria-labelledby="legacy-adviser-title">
        {links.map((link) => {
          const changed = link.relationshipChangedFor === link.schoolYear;
          return (
            <li key={link.id} className="learner-row">
              <span className="learner-avatar" aria-hidden="true">{initials(link.learnerName)}</span>
              <span className="learner-row-body">
                <span className="learner-row-top"><span className="learner-row-name">{nameCase(link.learnerName) || S.legacyAdviserUnnamed}</span></span>
                <span className="learner-row-preview">
                  {changed ? S.legacyAdviserChanged : (
                    <button type="button" onClick={() => show(link)}
                      style={{ background: 'none', border: 0, padding: '12px 6px', margin: '-12px -6px', font: 'inherit', fontWeight: 600, color: T.primary, cursor: 'pointer' }}>{S.legacyAdviserChange}</button>
                  )}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {sheet}
    </section>
  );
}
