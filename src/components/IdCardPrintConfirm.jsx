import { useState } from 'react';
import { Confirm } from './ui.jsx';
import { isAdmin } from '../lib/access.js';
import { cardsLabel } from '../lib/idCardQueue.js';
import { markIdCardsPrinted } from '../data/idCards.js';

// Browsers don't report whether the printer actually printed, so after the
// print dialog closes the person at the printer says whether the cards came
// out right. Only admins can write learner records, so only they are asked.
export function useIdCardPrintConfirm(me, { onMarked } = {}) {
  const [batch, setBatch] = useState(null);

  const printAndConfirm = (students) => {
    window.print();
    if (isAdmin(me) && students.length > 0) setBatch(students);
  };

  const confirmDialog = batch && (
    <Confirm
      title="Mark as printed?"
      danger={false}
      message={batch.length === 1 ? 'Did this card print correctly?' : `Did these ${cardsLabel(batch.length)} print correctly?`}
      label="Yes, mark as printed"
      cancelLabel="No, don't mark"
      onYes={async () => { await markIdCardsPrinted(batch, me); setBatch(null); onMarked?.(); }}
      onNo={() => setBatch(null)}
    />
  );

  return { printAndConfirm, confirmDialog };
}
