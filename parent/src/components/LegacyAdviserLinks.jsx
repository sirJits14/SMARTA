import S from '../strings.js';
import { T } from '../styles.js';
import { initials, nameCase } from '../lib/format.js';

// Home, DepEd accounts only: links made with an old adviser slip grant
// nothing since school roles moved to SIMS, so Home leaves them out of the
// learner list. They cannot be changed into family links here (that would be
// family access without approval); this says what to do instead.
export default function LegacyAdviserLinks({ links }) {
  if (!links?.length) return null;
  return (
    <section aria-labelledby="legacy-adviser-title" style={{ marginTop: 8 }}>
      <h2 id="legacy-adviser-title" style={{ fontSize: 15, margin: '0 0 4px' }}>{S.legacyAdviserTitle}</h2>
      <p style={{ fontSize: 13, color: T.inkMuted, margin: '0 0 8px' }}>{S.legacyAdviserHint}</p>
      <ul className="learner-list" aria-labelledby="legacy-adviser-title">
        {links.map((link) => (
          <li key={link.id} className="learner-row">
            <span className="learner-avatar" aria-hidden="true">{initials(link.learnerName)}</span>
            <span className="learner-row-body">
              <span className="learner-row-top"><span className="learner-row-name">{nameCase(link.learnerName) || S.legacyAdviserUnnamed}</span></span>
              <span className="learner-row-preview">{S.legacyAdviserRow}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
