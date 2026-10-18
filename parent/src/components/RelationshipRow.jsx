import S from '../strings.js';
import { T } from '../styles.js';
import { isFamilyLink } from '../../../shared/schoolAccess.js';

// Under the learner's header, for DepEd accounts only (spec 2026-10-17 §2).
// Hidden unless the link is an active family link: the screen's own banner
// covers ended access, and old adviser links can never be changed.
export default function RelationshipRow({ link, onChange }) {
  if (!isFamilyLink(link)) return null;
  const changed = link.relationshipChangedFor === link.schoolYear;
  return (
    <p className="relationship-row" style={{ margin: '0 0 12px', fontSize: 14, color: T.inkMuted, textAlign: 'center' }}>
      {S.relLinkedAs} <strong style={{ color: T.ink }}>{link.relationship}</strong>
      {changed
        ? (link.previousRelationship ? ` · ${S.relChangedFrom} ${link.previousRelationship}` : null)
        : <> · <button type="button" onClick={onChange}
            style={{ background: 'none', border: 0, padding: '12px 6px', margin: '-12px 0', font: 'inherit', fontWeight: 600, color: T.primary, cursor: 'pointer' }}>{S.relChange}</button></>}
    </p>
  );
}
