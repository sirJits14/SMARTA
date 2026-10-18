import { useCallback, useState } from 'react';
import { callable } from '../firebase.js';
import S from '../strings.js';

// Opens the relationship sheet for one of the account's own family links. The
// sheet is lazy-loaded (keeps the eager bundle small) and only DepEd accounts
// are shown a way to open it (spec 2026-10-17).
export function useRelationshipSheet() {
  const [open, setOpen] = useState(null);
  const [err, setErr] = useState(null);
  const show = (link) => {
    setErr(null);
    import('../components/RelationshipSheet.jsx').then((m) => setOpen({ Sheet: m.default, link })).catch(() => setErr(S.relChangeFailed));
  };
  const close = useCallback(() => setOpen(null), []);
  const save = (relationship) => callable('changeLinkRelationshipFn')({ studentId: open.link.studentId, relationship });
  const sheet = open && <open.Sheet link={open.link} onSave={save} onClose={close} />;
  return { show, sheet, err };
}
