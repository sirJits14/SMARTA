import S from '../../strings.js';
import { Banner, Btn } from '../../components/ui.jsx';
import Sheet from '../../components/Sheet.jsx';
import { STATUS_LABEL, requestDetail, requestTitle } from '../../lib/learnerRequests.js';

// The adviser's requests for this class, newest first. Kept apart from the portal for tests.
export function RequestsList({ requests, busy, error, onWithdraw, onSendAgain, onClose }) {
  return (
    <>
      {error && <Banner tone="danger">{error}</Banner>}
      {requests.length === 0 ? <p className="class-note">{S.requestsEmpty}</p> : (
        <ul className="request-list" aria-label={S.requestsTitle}>
          {requests.map((request) => (
            <li key={request.id} className="request-row">
              <div className="request-row-top">
                <span className="request-row-title">{requestTitle(request)}</span>
                <span className={`class-chip class-chip--${request.status}`}>{STATUS_LABEL[request.status]}</span>
              </div>
              <div className="request-row-detail">{requestDetail(request)}</div>
              {request.status === 'rejected' && request.decisionReason && <div className="request-row-reason">{S.requestReasonLabel}: {request.decisionReason}</div>}
              {request.status === 'pending' && (
                <button type="button" className="class-link" disabled={busy} onClick={() => onWithdraw(request.id)}>{S.withdrawRequest}</button>
              )}
              {request.status === 'rejected' && request.kind === 'add' && request.student && (
                <button type="button" className="class-link" disabled={busy} onClick={() => onSendAgain(request)}>{S.requestSendAgain}</button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Btn variant="ghost" onClick={onClose} style={{ width: '100%', marginTop: 10 }}>{S.requestsClose}</Btn>
    </>
  );
}

export default function RequestsSheet({ requests, busy, error, onWithdraw, onSendAgain, onClose }) {
  return (
    <Sheet title={S.requestsTitle} busy={busy} onClose={onClose}>
      <RequestsList requests={requests} busy={busy} error={error} onWithdraw={onWithdraw} onSendAgain={onSendAgain} onClose={onClose} />
    </Sheet>
  );
}
