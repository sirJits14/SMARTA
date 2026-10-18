import { useCallback, useState } from 'react';
import { callable } from '../firebase.js';
import S from '../strings.js';

// Opens the relationship sheet for one of the account's own family links. The
// sheet is lazy-loaded (keeps the eager bundle small) and only DepEd accounts
// are shown a way to open it (spec 2026-10-17). `onSaved` gets the new
// relationship once the server has saved it.
export function useRelationshipSheet({ onSaved } = {}) {
  const [open, setOpen] = useState(null);
  const [err, setErr] = useState(null);
  const show = (link) => {
    setErr(null);
    import('../components/RelationshipSheet.jsx').then((m) => setOpen({ Sheet: m.default, link })).catch(() => setErr(S.relChangeFailed));
  };
  const close = useCallback(() => setOpen(null), []);
  const save = async (relationship) => {
    await callable('changeLinkRelationshipFn')({ studentId: open.link.studentId, relationship });
    onSaved?.(relationship);
  };
  const sheet = open && <open.Sheet link={open.link} onSave={save} onClose={close} />;
  return { show, sheet, err };
}
