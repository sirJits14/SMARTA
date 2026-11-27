import { ActionFeedback, Btn, Card } from '../../components/ui.jsx';
import { skipReasonText } from '../../lib/tempPass.js';

// Messages above the controls of both pass tabs (printing: the usePassPrinting result).
export function PrintMessages({ printing, admin, principalMissing }) {
  return (
    <>
      <ActionFeedback action={printing.action} />
      {printing.notice && <p role="status" style={{ margin: '0 0 8px', fontSize: 13 }}>{printing.notice}</p>}
      {printing.confirmTimedOut && printing.waiting && <p role="alert" className="sims-feedback">Could not confirm the passes. Prepare them again.</p>}
      {principalMissing && (
        <p role="alert" className="sims-feedback">
          {admin ? "Add the principal's name and title in Settings before printing."
            : "Ask an administrator to add the principal's name and title in Settings before printing."}
        </p>
      )}
    </>
  );
}

// Prepare passes (n) → Print → Mark as printed (n).
export function PrintButtons({ printing, count, canPrepare, onPrepare }) {
  const { preview, preparing, marking } = printing;
  const ready = preview && preview.items.length > 0;
  return (
    <>
      <Btn loading={preparing} disabled={!canPrepare || count === 0 || marking} onClick={onPrepare}>{`Prepare passes (${count})`}</Btn>
      {ready && (
        <Btn disabled={!printing.printReady} onClick={printing.print}>{printing.printReady ? 'Print' : 'Confirming passes…'}</Btn>
      )}
      {ready && printing.markCount > 0 && (
        <Btn variant="ghost" loading={marking} disabled={!printing.canMark} onClick={printing.markPrinted}>
          {`Mark as printed (${printing.markCount})`}
        </Btn>
      )}
    </>
  );
}

// nameOf({ studentId, requestId }) names a learner the preview could not include.
export function NotPreparedList({ preview, nameOf }) {
  if (!preview?.notPrepared.length) return null;
  return (
    <Card style={{ padding: 16, marginBottom: 16 }}>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 13 }}>
        {preview.notPrepared.map((entry) => (
          <li key={`${entry.requestId ?? ''}:${entry.studentId}`} style={{ padding: '4px 0' }}>
            {`Not prepared: ${nameOf(entry)} — ${skipReasonText(entry.reason)}`}
          </li>
        ))}
      </ul>
    </Card>
  );
}
